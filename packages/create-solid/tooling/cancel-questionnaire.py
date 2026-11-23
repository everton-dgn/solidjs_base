"""Check Ctrl+C with the CLI in the foreground of a controlling terminal."""

import errno
import fcntl
import subprocess
import struct
import os
import pathlib
import pty
import re
import select
import shlex
import shutil
import signal
import sys
import tempfile
import termios
import time
import unittest
from urllib.parse import quote

cli = pathlib.Path(sys.argv.pop(1)).resolve()
node = shutil.which("node")


class Screen:
    """Model a terminal that clips its rows on a resize instead of reflowing them."""

    def __init__(self, columns):
        self.columns = columns
        self.rows = [[]]
        self.row = self.column = 0
        self.wrap = True

    def resize(self, columns):
        self.columns = columns
        self.rows = [cells[:columns] for cells in self.rows]
        self.column = min(self.column, columns - 1)

    def feed(self, text):
        for sequence, char in re.findall(r"(\x1b\[[0-?]*[ -/]*[@-~])|([\s\S])", text):
            move = re.fullmatch(r"\x1b\[(\d*)([ABCDG])", sequence)
            if sequence in ("\x1b[?7h", "\x1b[?7l"):
                self.wrap = sequence.endswith("h")
            elif sequence in ("\x1b[?25h", "\x1b[?25l"):
                pass
            elif sequence == "\x1b[2K":
                self.cells().clear()
            elif sequence == "\x1b[J":
                del self.cells()[self.column:]
                del self.rows[self.row + 1:]
            elif move:
                count = int(move[1] or 1)
                self.row, self.column = {
                    "A": (max(0, self.row - count), self.column),
                    "B": (self.row + count, self.column),
                    "C": (self.row, min(self.columns - 1, self.column + count)),
                    "D": (self.row, max(0, self.column - count)),
                    "G": (self.row, count - 1),
                }[move[2]]
            elif sequence or not (char in "\r\n" or char.isprintable()):
                # An unknown byte would leave this model showing a screen the terminal does not have.
                raise AssertionError(repr(sequence or char))
            elif char == "\r":
                self.column = 0
            elif char == "\n":
                self.row += 1
            else:
                if self.column == self.columns:
                    if self.wrap:
                        self.row += 1
                    self.column = 0 if self.wrap else self.columns - 1
                cells = self.cells()
                cells.extend(" " * (self.column - len(cells)))
                cells[self.column:self.column + 1] = [char]
                self.column += 1

    def cells(self):
        while self.row >= len(self.rows):
            self.rows.append([])
        return self.rows[self.row]

    def lines(self):
        self.cells()
        return ["".join(cells) for cells in self.rows]


def install_screen(transcript, columns):
    screen = Screen(columns)
    screen.feed(transcript.decode().rsplit("Files created", 1)[1].lstrip("\r\n"))
    return screen.lines()


def fork_terminal():
    """Fork like pty.fork, keeping the slave open: macOS discards unread output when its last descriptor closes."""
    master, slave = pty.openpty()
    pid = os.fork()
    if pid == 0:
        os.close(master)
        os.setsid()
        fcntl.ioctl(slave, termios.TIOCSCTTY, 0)
        for descriptor in (0, 1, 2):
            os.dup2(slave, descriptor)
        os.close(slave)
    return pid, master, slave


def start_cli(root, arguments, environment, job_control=False, launcher=False, executable=cli, shell=False):
    """Fork the CLI on a new terminal: alone in its session, under a parent that waits like a shell with job control, or under a shell of its own group.

    With shell, that parent also takes the terminal back on every stop, as a shell does, and gives it back with SIGCONT when the script calls foreground."""
    pid, master, slave = fork_terminal()
    if pid == 0:
        os.chdir(root)
        if job_control:
            # Keep a parent in this session but outside the foreground group.
            modes = termios.tcgetattr(0)
            reader, writer = os.pipe()
            child = os.fork()
            if child:
                os.close(reader)
                # A process outside the foreground group that changes the terminal gets SIGTTOU, and a shell ignores it.
                signal.signal(signal.SIGTTOU, signal.SIG_IGN)
                os.setpgid(child, child)
                os.tcsetpgrp(0, child)
                os.write(writer, b"x")
                os.close(writer)
                _, status = os.waitpid(child, os.WUNTRACED)
                if not os.WIFSTOPPED(status):
                    os._exit(1)
                stops = 1
                while shell and os.WIFSTOPPED(status):
                    os.tcsetpgrp(0, os.getpgrp())
                    termios.tcsetattr(0, termios.TCSANOW, modes)
                    (root / ("stop.signal" if stops == 1 else f"stop.{stops}.signal")).write_text(str(os.WSTOPSIG(status)))
                    while not (root / f"foreground.{stops}").exists():
                        time.sleep(.005)
                    os.tcsetpgrp(0, child)
                    os.killpg(child, signal.SIGCONT)
                    stops += 1
                    _, status = os.waitpid(child, os.WUNTRACED)
                if not shell:
                    (root / "stop.signal").write_text(str(os.WSTOPSIG(status)))
                    _, status = os.waitpid(child, 0)
                os._exit(os.waitstatus_to_exitcode(status))
            os.close(writer)
            os.read(reader, 1)
            os.close(reader)
        (root / "cli.pid").write_text(str(os.getpid()))
        fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 80, 0, 0))
        os.environ.update(CI="false", NO_COLOR="1", TERM="xterm", **environment)
        command = [node, str(executable), *arguments]
        if launcher:
            # A second command keeps the shell above the CLI, in its group, as npx and pnpm dlx stay.
            os.execv("/bin/sh", ["/bin/sh", "-c", shlex.join(command) + "; exit $?"])
        os.execv(node, command)
    return pid, master, slave


def foreground(root, stop):
    """Play fg for the given stop of a CLI started with shell."""
    (root / f"foreground.{stop}").touch()


def state(process):
    return subprocess.check_output(["ps", "-o", "stat=", "-p", str(process)], text=True).strip()


def broken_cli(root):
    """Copy the CLI with a setting that makes the files step fail."""
    dist = root / "package/dist"
    shutil.copytree(cli.parent, dist)
    (dist.parent / "template").symlink_to(cli.parent.parent / "template")
    settings = dist / "settings.json"
    settings.write_text(settings.read_text().replace('"@evertondgn/solid-runtime":', '"absent":'))
    return dist / cli.name


# The files step ends in a synchronous part; this module holds the event loop there until the script creates the RELEASE file.
HOLD_MODULE = """
import fs, { existsSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const original = fs[process.env.HOLD_AT];
let held = false;
fs[process.env.HOLD_AT] = (...args) => {
  if (!held && /\\.create-solid-[^/]+$/.test(String(args[0]))) {
    held = true;
    writeFileSync(process.env.HOLDING, '1');
    while (!existsSync(process.env.RELEASE)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  }
  return original(...args);
};
syncBuiltinESMExports();
"""


class Reader:
    """Collect what the CLI writes to its terminal."""

    def __init__(self, case, master):
        self.case = case
        self.master = master
        self.transcript = bytearray()

    def until(self, marker, start=0, count=1):
        deadline = time.monotonic() + 8
        while self.transcript.count(marker, start) < count:
            self.case.assertTrue(select.select([self.master], [], [], max(0, deadline-time.monotonic()))[0], self.transcript)
            block = os.read(self.master, 65536)
            self.case.assertTrue(block, self.transcript)
            self.transcript.extend(block)

    def drain(self):
        while select.select([self.master], [], [], 0)[0]:
            try:
                block = os.read(self.master, 65536)
            except OSError as error:
                if error.errno != errno.EIO:
                    raise
                break
            if not block:
                break
            self.transcript.extend(block)

    def cursor(self):
        return re.findall(rb"\x1b\[\?25[hl]", self.transcript)[-1]


def recorded(file):
    """Read the number in a file once it has content: a file exists before its content is written."""
    deadline = time.monotonic() + 10
    while True:
        text = file.read_text().strip() if file.exists() else ""
        if text or time.monotonic() >= deadline:
            return int(text) if text else None
        time.sleep(.01)


def question_session(directory, language, prompts, before_answer=None, color=False, columns=80, piped=False, ask_directory=False, name="app"):
    master, slave = pty.openpty()
    try:
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, columns, 0, 0))
        with subprocess.Popen([node, cli, *([] if ask_directory else [name]), "--lang", language, "--mode", "server",
                               "--no-git", "--install" if piped else "--no-install"], cwd=directory,
                              env=dict(os.environ, PATH=directory + os.pathsep + os.environ["PATH"] if piped else os.environ["PATH"], CI="false", NO_COLOR="" if color else "1", FORCE_COLOR="1" if color else "0", TERM="xterm"),
                              stdin=slave, stdout=subprocess.PIPE if piped else slave, stderr=slave) as child:
            reader = child.stdout.fileno() if piped else master
            os.close(slave)
            slave = None
            output = bytearray()
            offset = 0
            try:
                for label, key in prompts:
                    until = time.monotonic() + 5
                    while label.encode() not in output[offset:]:
                        if not select.select([reader], [], [], max(0, until-time.monotonic()))[0]:
                            raise AssertionError((label, output.decode()))
                        block = os.read(reader, 65536)
                        if not block:
                            raise AssertionError((label, output.decode()))
                        output.extend(block)
                    offset = len(output)
                    if before_answer:
                        before_answer(label)
                    os.write(master, key)
                until = time.monotonic() + 5
                while select.select([reader], [], [], max(0, until-time.monotonic()))[0]:
                    try:
                        block = os.read(reader, 65536)
                    except OSError as error:
                        if error.errno != errno.EIO:
                            raise
                        break
                    if not block:
                        break
                    output.extend(block)
                return output.decode(), child.wait(timeout=1)
            finally:
                if child.poll() is None:
                    child.kill()
    finally:
        os.close(master)
        if slave is not None:
            os.close(slave)


class Cancellation(unittest.TestCase):
    def exercise(self, install, failure=False, git=False, interrupt=None, columns=80, descendant=False, second=False, git_warning=False, files_failure=False, plain=False, success=False):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            bun = root / ("git" if git else "bun")
            bun.write_text('#!/bin/sh\nif [ "$1" = install ]; then echo $$ > "$PID_FILE"; exec sleep 20; fi\n')
            if interrupt and install:
                bun.write_text('#!/bin/sh\ntrap "" INT\necho $$ > "$PID_FILE"\nexec sleep 20\n')
            if descendant:
                bun.write_text('#!/bin/sh\ntrap "" INT HUP TERM\nsleep 30 &\necho $! > grandchild.pid\necho $$ > "$PID_FILE"\nwait\n')
            if git:
                bun.write_text('#!/bin/sh\necho $$ > "$PID_FILE"\nexec sleep 20\n')
            if failure:
                bun.write_text('#!/bin/sh\nif [ "$1" = install ]; then for line in discarded-line one two three four five registry-failure; do echo "$line" >&2; done; exit 1; fi\n')
            bun.chmod(0o755)
            if success:
                bun.write_text("#!/bin/sh\nexit 0\n")
            executable = cli
            if git_warning:
                bun.write_text("#!/bin/sh\necho denied >&2\nexit 1\n")
                installer = root / "bun"
                installer.write_text("#!/bin/sh\nprintf 'first\\nsecond\\nthird\\n' >&2\nexit 0\n")
                installer.chmod(0o755)
            if files_failure:
                executable = broken_cli(root)
            pid, terminal = pty.fork()
            if pid == 0:
                os.chdir(root)
                fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", 40, columns, 0, 0))
                os.environ.update(CI="false", NO_COLOR="1", PID_FILE=str(root / "pid"),
                                  PATH=str(root) + ":" + os.environ["PATH"])
                os.execv(node, [node, str(executable), "parent/app", "--lang", "en",
                                *(["--yes"] if plain else []), "--mode", "server", "--git" if git else "--no-git", "--install" if install else "--no-install"])
            transcript = bytearray()
            waited = False
            deadline = time.monotonic() + 10
            try:
                for label in [] if plain else [b"Application title", b"Setup", b"Create the project?",
                              b"Installing" if install else (b"Creating the Git repository" if git else b"Creating the files")]:
                    deadline = time.monotonic() + 10
                    while label not in transcript:
                        self.assertTrue(select.select([terminal], [], [], max(0, deadline-time.monotonic()))[0], transcript)
                        block = os.read(terminal, 65536)
                        self.assertTrue(block, (label, transcript))
                        transcript.extend(block)
                    if label in [b"Creating the files", b"Creating the Git repository", b"Installing"]:
                        break
                    os.write(terminal, b"\r")
                if (install or git) and not (success or failure or git_warning or files_failure):
                    installer = recorded(root / "pid")
                    self.assertIsNotNone(installer)
                if plain:
                    # macOS discards the output nobody has read when the terminal turns Ctrl+C into SIGINT.
                    while b"Files created" not in transcript:
                        self.assertTrue(select.select([terminal], [], [], max(0, deadline-time.monotonic()))[0], transcript)
                        transcript.extend(os.read(terminal, 65536))
                if interrupt:
                    started = time.monotonic()
                    os.kill(pid, interrupt)
                    if second:
                        time.sleep(.08)
                        os.kill(pid, signal.SIGHUP)
                    if descendant:
                        deadline = started + (.65 if second else 2)

                elif not (success or failure or git_warning or files_failure):
                    os.write(terminal, b"\x03")
                while time.monotonic() < deadline:
                    if select.select([terminal], [], [], .02)[0]:
                        try:
                            transcript.extend(os.read(terminal, 65536))
                        except OSError:
                            pass
                    finished, status = os.waitpid(pid, os.WNOHANG)
                    if finished:
                        waited = True
                        break
                    time.sleep(.01)
                self.assertTrue(waited)
                while select.select([terminal], [], [], 0)[0]:
                    try:
                        block = os.read(terminal, 65536)
                    except OSError:
                        break
                    if not block:
                        break
                    transcript.extend(block)
                cursor = rb"\x1b\[\?25[hl]"
                if plain:
                    self.assertNotRegex(transcript, cursor)
                else:
                    after_prompt = transcript.split(b"Create the project?")[-1]
                    last_prompt_show = after_prompt.index(b"\x1b[?25h")
                    steps = 1 + int(git) + int(install)
                    self.assertEqual(re.findall(cursor, after_prompt[last_prompt_show:])[1:],
                                     [b"\x1b[?25l", b"\x1b[?25h"] * steps)
                    self.assertEqual(re.findall(cursor, transcript)[-1], b"\x1b[?25h")
                if success:
                    self.assertEqual(os.waitstatus_to_exitcode(status), 0)
                    self.assertIn(b"Project created.", transcript)
                    return
                if git_warning:
                    screen = install_screen(transcript, columns)
                    for diagnostic in (b"first", b"second", b"third"):
                        self.assertNotIn(diagnostic, transcript)
                    warning = screen.index("▲  Git repository not created")
                    self.assertEqual(screen[warning:warning + 3], [
                        "▲  Git repository not created", "│  denied", "◇  Dependencies installed with Bun"])
                    self.assertTrue(any(re.fullmatch(r"│  git init +│", line) for line in screen), screen)
                    self.assertEqual(os.waitstatus_to_exitcode(status), 0)
                    return
                if files_failure:
                    lines = transcript.decode().rsplit("\x1b[J", 1)[-1].removeprefix("\x1b[?25h").rstrip().splitlines()
                    self.assertEqual(lines, ["▲  Could not create the files",
                        "│  Missing version for @evertondgn/solid-runtime", "│", "└  Creation stopped."])
                    self.assertEqual(os.waitstatus_to_exitcode(status), 1)
                    return
                if columns == 30:
                    lines = transcript.decode().splitlines()
                    self.assertTrue(any(re.fullmatch(r"│  diagnostics +│", line) for line in lines), lines)
                    self.assertEqual(lines[1:4], ["│  Start a Solid 2 application", "│  with Vite+, TypeScript and",
                                                  "│  tests set up."])
                    self.assertIn("│  Your project is in", lines)
                    self.assertIn("│  parent/app. To finish, run:", lines)
                    self.assertRegex(transcript.decode(), r"[◒◐◓◑]  Installing dependencies wi…")
                    self.assertIn("Installing dependencies wi…".encode(), transcript)
                    self.assertNotIn(b"Installing dependencies with Bun", transcript)
                if columns in (30, 36):
                    screen = install_screen(transcript, columns)
                    cancel = next(i for i, line in enumerate(screen) if line.startswith("■"))
                    self.assertFalse(any(line.startswith(tuple("◒◐◓◑")) for line in screen[:cancel]), screen)
                    frames = re.findall(r"\r\x1b\[\?7l([◒◐◓◑]  [^\x1b\r\n^]+)\x1b\[\?7h", transcript.decode())
                    self.assertTrue(frames)
                    for frame in frames:
                        self.assertLessEqual(len(frame), columns)
                if failure:
                    self.assertEqual(os.waitstatus_to_exitcode(status), 1)
                    self.assertIn("▲  Could not install dependencies with Bun".encode(), transcript)
                    self.assertIn("│  Your project is in parent/app. To finish, run:".encode(), transcript)
                    self.assertIn("└  Creation stopped.".encode(), transcript.split(b"registry-failure")[-1])
                    self.assertIn(b"registry-failure", transcript)
                    self.assertNotIn(b"discarded-line", transcript)
                    self.assertIn("│  cd parent/app\r\n│  bun install".encode(), transcript)
                    screen = install_screen(transcript, columns)
                    tail = screen.index("│  registry-failure")
                    self.assertEqual(screen[tail + 1:tail + 3], [
                        "│", "│  Your project is in parent/app. To finish, run:"])
                    return
                if plain:
                    # Only Ctrl+C is echoed by the terminal, and its echo stays alone on its line.
                    echo = [] if interrupt else ["^C"]
                    closing = [*echo, "■ Installing dependencies with Bun", "Your project is in parent/app. To finish, run:",
                               "cd parent/app", "bun install", "", "Creation canceled."]
                    lines = transcript.decode().rstrip().splitlines()
                    self.assertEqual(lines[-len(closing) - 1:], ["◇ Files created", *closing])
                if columns == 80 and (install or git) and not plain:
                    lines = install_screen(transcript, columns)
                    while lines and not lines[-1]:
                        lines.pop()
                    expected = ["■  Creating the Git repository" if git else "■  Installing dependencies with Bun",
                                "│  Your project is in parent/app. To finish, run:", "│  cd parent/app"]
                    if git:
                        expected.append("│  git init")
                    if install:
                        expected.append("│  bun install")
                    expected.extend(["│", "└  Creation canceled."])
                    self.assertEqual(lines[-len(expected):], expected)
                self.assertEqual(transcript.count(b"Creation canceled."), 1, transcript)
                self.assertEqual(os.waitstatus_to_exitcode(status), 130)
                if install or git:
                    self.assertIn(b"bun install" if install else b"git init", transcript)
                    self.assertTrue((root / "parent/app/package.json").exists())
                    with self.assertRaises(ProcessLookupError):
                        os.kill(installer, 0)
                else:
                    self.assertFalse((root / "parent").exists())
            finally:
                os.close(terminal)
                if not waited:
                    os.kill(pid, signal.SIGKILL)
                    os.waitpid(pid, 0)
                for file in (root / "parent/app/grandchild.pid", root / "pid"):
                    target = recorded(file) if file.exists() else None
                    try:
                        if target and os.getsid(target) == pid:
                            os.kill(target, signal.SIGKILL)
                    except ProcessLookupError:
                        pass

    def test_piped_questionnaire(self):
        for canceled in (True, False):
            with self.subTest(canceled=canceled), tempfile.TemporaryDirectory() as directory:
                bun = pathlib.Path(directory, "bun")
                bun.write_text("#!/bin/sh\nexit 0\n")
                bun.chmod(0o755)
                prompts = [("Application title", b"\x03" if canceled else b"\r")]
                if not canceled:
                    prompts.extend([("Setup", b"\r"), ("Create the project?", b"\r")])
                output, status = question_session(directory, "en", prompts, piped=True)
                self.assertEqual(status, 130 if canceled else 0, output)
                self.assertEqual(output.replace("\x1b[?25h", "").rstrip().splitlines()[-1],
                                 "└  Creation canceled." if canceled else "└  Project created.")

    def test_step_job_signals(self):
        # Without a key the script stops the CLI itself, as an outside SIGSTOP would.
        for key, job_control in [(b"\x1a", False), (b"\x1a", True), (b"\x1c", False), (None, False)]:
            with self.subTest(key=key, job_control=job_control), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                installer = root / "bun"
                # The shell stays as the installer: with exec sleep it missed the stop in 5 of 120 runs, and in none without exec.
                installer.write_text('#!/bin/sh\necho $$ > "$PID_FILE"\nsleep 20\n')
                installer.chmod(0o755)
                pid, master, slave = start_cli(
                    root, ["app", "--lang", "en", "--mode", "server", "--no-git", "--install"],
                    {"PID_FILE": str(root / "installer.pid"), "PATH": directory + ":" + os.environ["PATH"]}, job_control)
                reader = Reader(self, master)
                transcript, read_until, drain = reader.transcript, reader.until, reader.drain
                waited = False
                def assert_cleared(start):
                    end = transcript.index(b"\x1b[?25h", start)
                    frame = transcript.rindex(b"Installing dependencies with Bun", 0, end)
                    self.assertIn(b"\r\x1b[J", transcript[frame:end])
                def stop_outside():
                    os.kill(leader, signal.SIGSTOP)
                    deadline = time.monotonic() + 4
                    while "T" not in state(leader):
                        self.assertLess(time.monotonic(), deadline)
                        time.sleep(.01)
                    # A stopped CLI writes nothing more, so this reads all it wrote before the stop.
                    drain()
                    self.assertEqual(reader.cursor(), hidden)
                try:
                    for prompt in [b"Application title", b"Setup", b"Create the project?"]:
                        read_until(prompt)
                        os.write(master, b"\r")
                    read_until(b"Installing dependencies with Bun")
                    worker = recorded(root / "installer.pid")
                    leader = recorded(root / "cli.pid")
                    self.assertEqual(os.getsid(leader), pid)
                    self.assertEqual(os.getpgid(worker), leader)
                    self.assertEqual(os.getpgid(leader), leader)
                    start = len(transcript)
                    hidden = b"\x1b[?25l"
                    shown = b"\x1b[?25h"
                    continued = outside = None
                    if key:
                        os.write(master, key)
                        read_until(shown, start)
                        assert_cleared(start)
                    else:
                        stop_outside()
                    if key != b"\x1c":
                        if job_control:
                            self.assertEqual(recorded(root / "stop.signal"), signal.SIGTSTP)
                            self.assertIn("T", state(leader))
                            self.assertIn("T", state(worker))
                            # A stopped CLI writes nothing more, so this reads all it wrote before the stop.
                            drain()
                            self.assertEqual(reader.cursor(), shown)
                        if job_control or not key:
                            continued = len(transcript)
                            os.killpg(leader, signal.SIGCONT)
                        for attempt in range(2 if continued is None else 1):
                            if attempt:
                                start = len(transcript)
                                os.write(master, key)
                                read_until(shown, start)
                                assert_cleared(start)
                            restored = transcript.index(shown, start) + len(shown) if continued is None else continued
                            read_until(hidden, restored)
                            # libuv delivers a pending SIGCONT between two timer runs, so the third frame comes after it.
                            read_until(b"Installing dependencies with Bun", transcript.index(hidden, restored), 3)
                            self.assertNotIn("T", state(leader))
                            self.assertNotIn("T", state(worker))
                        if key:
                            # The listener that suspend registers again restores the step after a later outside stop.
                            stop_outside()
                            outside = len(transcript)
                            os.killpg(leader, signal.SIGCONT)
                            read_until(hidden + b"\r\x1b[J\r\x1b[?7l", outside)
                            read_until(b"Installing dependencies with Bun", outside, 3)
                            self.assertNotIn("T", state(leader))
                        os.write(master, b"\x03")
                        read_until("└  Creation canceled.".encode(), start)
                    deadline = time.monotonic() + 5
                    while time.monotonic() < deadline:
                        finished, status = os.waitpid(pid, os.WNOHANG)
                        if finished:
                            waited = True
                            break
                        time.sleep(.01)
                    self.assertTrue(waited)
                    drain()
                    self.assertEqual(reader.cursor(), shown)
                    self.assertEqual(os.waitstatus_to_exitcode(status), -signal.SIGQUIT if key == b"\x1c" else 130)
                    if continued is not None:
                        self.assertEqual(transcript.count(hidden, continued, outside), 1)
                    if outside is not None:
                        self.assertEqual(transcript.count(hidden, outside), 1)
                    if key == b"\x1c":
                        tail = transcript[transcript.index(b"\x1b[?25h", start):]
                        self.assertNotIn(b"Installing dependencies with Bun", tail)
                        self.assertNotIn("└".encode(), tail)
                        self.assertNotIn(b"Creation canceled.", transcript)
                finally:
                    for file in (root / "installer.pid", root / "cli.pid"):
                        target = recorded(file) if file.exists() else None
                        try:
                            if target and os.getsid(target) == pid:
                                os.kill(target, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                    os.close(master)
                    os.close(slave)
                    if not waited:
                        os.kill(pid, signal.SIGKILL)
                        os.waitpid(pid, 0)

    def test_step_launcher_signals(self):
        # The files step holds the event loop; this holds it until the script has sent its signals.
        hold = """
import { existsSync } from 'node:fs';
const write = process.stdout.write.bind(process.stdout);
let held = false;
process.stdout.write = (...args) => {
  const result = write(...args);
  if (!held && String(args[0]).includes('Creating the files')) {
    held = true;
    while (!existsSync(process.env.RELEASE)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  }
  return result;
};
"""
        for continued_first in (True, False):
            with self.subTest(continued_first=continued_first), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                release = root / "release"
                pid, master, slave = start_cli(
                    root, ["app", "--lang", "en", "--mode", "server", "--no-git", "--no-install"],
                    {"NODE_OPTIONS": "--import=data:text/javascript," + quote(hold), "RELEASE": str(release)},
                    job_control=True, launcher=True)
                reader = Reader(self, master)
                transcript = reader.transcript
                waited = False
                hidden = b"\x1b[?25l"
                shown = b"\x1b[?25h"
                try:
                    for prompt in [b"Application title", b"Setup", b"Create the project?"]:
                        reader.until(prompt)
                        os.write(master, b"\r")
                    reader.until(b"Creating the files")
                    leader = recorded(root / "cli.pid")
                    worker = int(subprocess.check_output(["pgrep", "-P", str(leader)], text=True))
                    start = len(transcript)
                    os.write(master, b"\x1a")
                    # The terminal stops the shell at once, while the CLI has not read its signal yet.
                    self.assertEqual(recorded(root / "stop.signal"), signal.SIGTSTP)
                    self.assertIn("T", state(leader))
                    self.assertNotIn("T", state(worker))
                    if continued_first:
                        os.killpg(leader, signal.SIGCONT)
                    release.touch()
                    if not continued_first:
                        deadline = time.monotonic() + 4
                        while "T" not in state(worker):
                            self.assertLess(time.monotonic(), deadline)
                            time.sleep(.01)
                        # A stopped CLI writes nothing more, so this reads all it wrote before the stop.
                        reader.drain()
                        self.assertEqual(reader.cursor(), shown)
                        self.assertNotIn(b"Files created", transcript)
                        continued = len(transcript)
                        os.killpg(leader, signal.SIGCONT)
                    reader.until("└  Project created.".encode(), start)
                    deadline = time.monotonic() + 5
                    while time.monotonic() < deadline:
                        finished, status = os.waitpid(pid, os.WNOHANG)
                        if finished:
                            waited = True
                            break
                        time.sleep(.01)
                    self.assertTrue(waited)
                    reader.drain()
                    self.assertEqual(os.waitstatus_to_exitcode(status), 0)
                    closed = transcript.index(b"Files created", start)
                    cursors = re.findall(rb"\x1b\[\?25[hl]", transcript[start:closed])
                    # A continue read before the stop cancels it; a stop made inside the step hides the cursor once when it continues.
                    self.assertEqual(cursors, [hidden, shown] if continued_first else [shown, hidden, shown])
                    if not continued_first:
                        self.assertEqual(transcript.count(hidden, continued), 1)
                finally:
                    release.touch()
                    target = recorded(root / "cli.pid") if (root / "cli.pid").exists() else None
                    try:
                        if target and os.getsid(target) == pid:
                            os.killpg(target, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    os.close(master)
                    os.close(slave)
                    if not waited:
                        os.kill(pid, signal.SIGKILL)
                        os.waitpid(pid, 0)

    def test_question_job_signals(self):
        # A text, a select and a confirm question; the installer runs only where the test goes on to a step.
        for stage, job_control, launcher in [(b"Application title", True, False), (b"Application title", False, False),
                                             (b"Setup", True, True), (b"Create the project?", True, False)]:
            with self.subTest(stage=stage, job_control=job_control, launcher=launcher), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                installer = root / "bun"
                installer.write_text('#!/bin/sh\necho $$ > "$PID_FILE"\nsleep 20\n')
                installer.chmod(0o755)
                pid, master, slave = start_cli(
                    root, ["app", "--lang", "en", "--mode", "server", "--no-git", "--no-install" if job_control else "--install"],
                    {"PID_FILE": str(root / "installer.pid"), "PATH": directory + ":" + os.environ["PATH"]}, job_control, launcher)
                reader = Reader(self, master)
                transcript = reader.transcript
                waited = False
                hidden = b"\x1b[?25l"
                shown = b"\x1b[?25h"
                frame_end = "└\r\n".encode()
                def cooked():
                    flags = termios.tcgetattr(slave)[3]
                    return all(flags & flag for flag in (termios.ICANON, termios.ECHO, termios.ISIG))
                def rows():
                    screen = Screen(80)
                    screen.feed(transcript.decode())
                    lines = screen.lines()
                    while lines and not lines[-1]:
                        lines.pop()
                    return lines
                try:
                    for prompt in [b"Application title", b"Setup", b"Create the project?"]:
                        reader.until(prompt)
                        if prompt == stage:
                            break
                        os.write(master, b"\r")
                    reader.until(frame_end, transcript.index(stage))
                    leader = recorded(root / "cli.pid")
                    self.assertFalse(cooked())
                    start = len(transcript)
                    os.write(master, b"\x1a")
                    reader.until(shown, start)
                    if job_control:
                        self.assertEqual(recorded(root / "stop.signal"), signal.SIGTSTP)
                        members = [leader]
                        if launcher:
                            members.extend(map(int, subprocess.check_output(["pgrep", "-P", str(leader)], text=True).split()))
                            self.assertEqual(len(members), 2)
                        for member in members:
                            self.assertIn("T", state(member))
                        # A stopped CLI writes nothing more, so this reads all it wrote before the stop.
                        reader.drain()
                        self.assertEqual(reader.cursor(), shown)
                        self.assertTrue(cooked())
                        # A shell writes below the question while the CLI is stopped and when it continues it.
                        os.write(slave, b"[1]+  Stopped\r\n$ fg\r\n")
                        reader.until(b"$ fg", start)
                        continued = len(transcript)
                        os.killpg(leader, signal.SIGCONT)
                        reader.until(stage, continued)
                        reader.until(frame_end, transcript.index(stage, continued))
                        self.assertEqual(transcript.count(stage, continued), 1)
                    else:
                        reader.until(hidden, transcript.index(shown, start))
                        self.assertNotIn("T", state(leader))
                    self.assertFalse(cooked())
                    answered = len(transcript)
                    if stage == b"Application title":
                        os.write(master, b"abc")
                        reader.until("│  abc".encode(), answered)
                    os.write(master, b"\r")
                    if stage == b"Create the project?":
                        reader.until("└  Project created.".encode(), answered)
                    else:
                        reader.until(b"Create the project?" if stage == b"Setup" else b"Setup", answered)
                        reader.until(frame_end, answered)
                    if job_control and not launcher and stage == b"Application title":
                        os.write(master, b"\x03")
                        reader.until("└  Creation canceled.".encode(), answered)
                        lines = rows()
                        shell = lines.index("[1]+  Stopped")
                        # The question was erased before the stop, so the shell wrote right below the tagline.
                        self.assertEqual(lines[shell - 1], "│  Start a Solid 2 application with Vite+, TypeScript and tests set up.")
                        self.assertEqual(lines[shell:], [
                            "[1]+  Stopped", "$ fg", "│", "◇  Application title", "│  abc", "│", "■  Setup",
                            "│  Recommended", "│", "└  Creation canceled."])
                    if not job_control:
                        self.assertEqual(sum("Application title" in line for line in rows()), 1)
                        # The listener that readline registers for the key must be gone when a step is stopped from outside.
                        os.write(master, b"\r")
                        reader.until(b"Create the project?", answered)
                        os.write(master, b"\r")
                        reader.until(b"Installing dependencies with Bun", answered)
                        self.assertIsNotNone(recorded(root / "installer.pid"))
                        os.kill(leader, signal.SIGSTOP)
                        deadline = time.monotonic() + 4
                        while "T" not in state(leader):
                            self.assertLess(time.monotonic(), deadline)
                            time.sleep(.01)
                        reader.drain()
                        outside = len(transcript)
                        os.killpg(leader, signal.SIGCONT)
                        reader.until(hidden + b"\r\x1b[J\r\x1b[?7l", outside)
                        self.assertTrue(cooked())
                    if stage != b"Create the project?" and (launcher or not job_control):
                        os.write(master, b"\x03")
                        reader.until("└  Creation canceled.".encode(), answered)
                    deadline = time.monotonic() + 5
                    while time.monotonic() < deadline:
                        finished, status = os.waitpid(pid, os.WNOHANG)
                        if finished:
                            waited = True
                            break
                        time.sleep(.01)
                    self.assertTrue(waited)
                    reader.drain()
                    self.assertEqual(reader.cursor(), shown)
                    self.assertEqual(os.waitstatus_to_exitcode(status), 0 if stage == b"Create the project?" else 130)
                finally:
                    for file in (root / "installer.pid", root / "cli.pid"):
                        target = recorded(file) if file.exists() else None
                        try:
                            if target and os.getsid(target) == pid:
                                os.kill(target, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                    os.close(master)
                    os.close(slave)
                    if not waited:
                        os.kill(pid, signal.SIGKILL)
                        os.waitpid(pid, 0)

    def test_question_suspend_cycles(self):
        # A text question with a typed value and the multiple selection, three times each under a parent that plays the shell.
        for stage, keys in [(b"Application title", [b"ab", b"c" * 40, b""]), (b"Features", [b" ", b"\x1b[B ", b""])]:
            with self.subTest(stage=stage), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                pid, master, slave = start_cli(
                    root, ["app", "--lang", "en", "--mode", "server", "--no-git", "--no-install"], {}, job_control=True, shell=True)
                reader = Reader(self, master)
                transcript = reader.transcript
                waited = False
                hidden = b"\x1b[?25l"
                shown = b"\x1b[?25h"
                frame_end = "└\r\n".encode()
                def cooked():
                    flags = termios.tcgetattr(slave)[3]
                    return all(flags & flag for flag in (termios.ICANON, termios.ECHO, termios.ISIG))
                def rows():
                    screen = Screen(80)
                    screen.feed(transcript.decode())
                    lines = screen.lines()
                    while lines and not lines[-1]:
                        lines.pop()
                    return lines
                try:
                    reader.until(b"Application title")
                    if stage == b"Features":
                        os.write(master, b"\r")
                        reader.until(b"Setup")
                        os.write(master, b"\x1b[B\r")
                        reader.until(stage)
                    reader.until(frame_end, transcript.index(stage))
                    leader = recorded(root / "cli.pid")
                    question = rows()[rows().index("◆  " + stage.decode()) - 1:]
                    above = rows()[:-len(question)]
                    for stop, typed in enumerate(keys, 1):
                        start = len(transcript)
                        os.write(master, b"\x1a")
                        self.assertEqual(recorded(root / ("stop.signal" if stop == 1 else f"stop.{stop}.signal")), signal.SIGTSTP)
                        self.assertIn("T", state(leader))
                        # A stopped CLI writes nothing more, so this reads all it wrote before the stop.
                        reader.drain()
                        self.assertEqual(reader.cursor(), shown)
                        self.assertTrue(cooked())
                        # No copy of the question stays where the shell writes.
                        self.assertEqual(rows(), above)
                        os.write(slave, f"[1]+  Stopped {stop}\r\n$ fg\r\n".encode())
                        reader.until(b"$ fg", start)
                        above.extend([f"[1]+  Stopped {stop}", "$ fg"])
                        continued = len(transcript)
                        foreground(root, stop)
                        reader.until(stage, continued)
                        reader.until(frame_end, transcript.index(stage, continued))
                        drawn = bytes(transcript[continued:])
                        # The continue hides the cursor once and draws the question once, as it was, with no render in between.
                        self.assertEqual(drawn.count(hidden), 1)
                        self.assertEqual(drawn.count(stage), 1)
                        self.assertNotIn(b"\x1b[999D", drawn)
                        self.assertEqual(rows(), above + question)
                        self.assertFalse(cooked())
                        if typed:
                            os.write(master, typed)
                            ending = ("ab" + "c" * 40 if stop == 2 else "ab") + "█" if stage == b"Application title" else "◻ " + ["SEO metadata", "Light and dark theme switcher"][stop - 1]
                            reader.until(ending.encode(), continued)
                            # Clack ends the render of one changed line with a move down to the last row.
                            reader.until(b"B", transcript.rindex(ending.encode()))
                            question = rows()[len(above):]
                    # A SIGCONT with no stop draws nothing.
                    before = len(transcript)
                    os.kill(leader, signal.SIGCONT)
                    # The second key is read after the loop turn that could have read the signal with the first one.
                    for key in (b" ", b" ") if stage == b"Features" else (b"d", b"e"):
                        size = len(transcript)
                        os.write(master, key)
                        reader.until(b"\x1b[999D", size)
                    self.assertEqual(transcript.count(stage, before), 0)
                    self.assertNotIn(hidden, transcript[before:])
                    self.assertFalse(cooked())
                    os.write(master, b"\x03")
                    reader.until("└  Creation canceled.".encode(), before)
                    deadline = time.monotonic() + 5
                    while time.monotonic() < deadline:
                        finished, status = os.waitpid(pid, os.WNOHANG)
                        if finished:
                            waited = True
                            break
                        time.sleep(.01)
                    self.assertTrue(waited)
                    reader.drain()
                    lines = rows()
                    self.assertEqual(lines[:len(above)], above)
                    self.assertEqual(sum(stage.decode() in line for line in lines), 1)
                    self.assertEqual(lines[-1], "└  Creation canceled.")
                    self.assertEqual(reader.cursor(), shown)
                    self.assertEqual(os.waitstatus_to_exitcode(status), 130)
                finally:
                    for stop in (1, 2, 3):
                        foreground(root, stop)
                    target = recorded(root / "cli.pid") if (root / "cli.pid").exists() else None
                    try:
                        if target and os.getsid(target) == pid:
                            os.kill(target, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    os.close(master)
                    os.close(slave)
                    if not waited:
                        os.kill(pid, signal.SIGKILL)
                        os.waitpid(pid, 0)

    def test_stop_after_the_launcher(self):
        # The terminal stops a launcher at once and the CLI later. Two signals put the two stops in that order every time.
        for stage in (b"Application title", b"Installing dependencies with Bun"):
            with self.subTest(stage=stage), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                installer = root / "bun"
                installer.write_text('#!/bin/sh\necho $$ > "$PID_FILE"\nsleep 20\n')
                installer.chmod(0o755)
                pid, master, slave = start_cli(
                    root, ["app", "--lang", "en", "--mode", "server", "--no-git", "--install"],
                    {"PID_FILE": str(root / "installer.pid"), "PATH": directory + ":" + os.environ["PATH"]},
                    job_control=True, launcher=True, shell=True)
                reader = Reader(self, master)
                transcript = reader.transcript
                waited = False
                hidden = b"\x1b[?25l"
                shown = b"\x1b[?25h"
                frame_end = "└\r\n".encode()
                def cooked():
                    flags = termios.tcgetattr(slave)[3]
                    return all(flags & flag for flag in (termios.ICANON, termios.ECHO, termios.ISIG))
                try:
                    for prompt in [b"Application title", b"Setup", b"Create the project?"]:
                        reader.until(prompt)
                        if prompt == stage:
                            break
                        os.write(master, b"\r")
                    if stage == b"Application title":
                        reader.until(frame_end, transcript.index(stage))
                    else:
                        reader.until(stage)
                        self.assertIsNotNone(recorded(root / "installer.pid"))
                    launcher = recorded(root / "cli.pid")
                    worker = int(subprocess.check_output(["pgrep", "-P", str(launcher)], text=True))
                    os.kill(launcher, signal.SIGSTOP)
                    # The parent has taken the terminal back when it records the stop.
                    self.assertEqual(recorded(root / "stop.signal"), signal.SIGSTOP)
                    reader.drain()
                    start = len(transcript)
                    os.kill(worker, signal.SIGTSTP)
                    deadline = time.monotonic() + 4
                    while "T" not in state(worker):
                        self.assertLess(time.monotonic(), deadline)
                        time.sleep(.01)
                    # A stopped CLI writes nothing more, so this reads all it wrote before the stop.
                    reader.drain()
                    # The shell owns the terminal: the CLI shows the cursor and erases nothing.
                    self.assertEqual(bytes(transcript[start:]), shown)
                    self.assertTrue(cooked())
                    os.write(slave, b"[1]+  Stopped\r\n$ fg\r\n")
                    reader.until(b"$ fg", start)
                    continued = len(transcript)
                    foreground(root, 1)
                    if stage == b"Application title":
                        # The question is drawn again below what the shell wrote.
                        reader.until(stage, continued)
                        reader.until(frame_end, transcript.index(stage, continued))
                        self.assertEqual(transcript.count(hidden, continued), 1)
                        self.assertFalse(cooked())
                        os.write(master, b"\r")
                        reader.until(b"Setup", continued)
                    else:
                        reader.until(hidden + b"\r\x1b[J\r\x1b[?7l", continued)
                        reader.until(stage, continued, 3)
                    os.write(master, b"\x03")
                    reader.until("└  Creation canceled.".encode(), continued)
                    deadline = time.monotonic() + 5
                    while time.monotonic() < deadline:
                        finished, status = os.waitpid(pid, os.WNOHANG)
                        if finished:
                            waited = True
                            break
                        time.sleep(.01)
                    self.assertTrue(waited)
                    reader.drain()
                    self.assertEqual(reader.cursor(), shown)
                    self.assertEqual(os.waitstatus_to_exitcode(status), 130)
                finally:
                    foreground(root, 1)
                    target = recorded(root / "cli.pid") if (root / "cli.pid").exists() else None
                    try:
                        if target and os.getsid(target) == pid:
                            os.killpg(target, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    os.close(master)
                    os.close(slave)
                    if not waited:
                        os.kill(pid, signal.SIGKILL)
                        os.waitpid(pid, 0)

    def test_stop_after_the_launcher_while_a_step_holds_the_loop(self):
        # The shell writes its prompt while the CLI is held in the last synchronous part of the files step. The signals
        # are the ones the terminal sends the group on Ctrl+Z, in the order a launcher sees them.
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            release = root / "release"
            pid, master, slave = start_cli(
                root, ["app", "--lang", "en", "--mode", "server", "--no-git", "--no-install"],
                {"NODE_OPTIONS": "--import=data:text/javascript," + quote(HOLD_MODULE), "HOLD_AT": "renameSync",
                 "HOLDING": str(root / "holding"), "RELEASE": str(release)},
                job_control=True, launcher=True, shell=True)
            reader = Reader(self, master)
            transcript = reader.transcript
            waited = False
            shown = b"\x1b[?25h"
            try:
                for prompt in [b"Application title", b"Setup", b"Create the project?"]:
                    reader.until(prompt)
                    os.write(master, b"\r")
                reader.until(b"Creating the files")
                self.assertEqual(recorded(root / "holding"), 1)
                launcher = recorded(root / "cli.pid")
                worker = int(subprocess.check_output(["pgrep", "-P", str(launcher)], text=True))
                os.kill(launcher, signal.SIGSTOP)
                # The parent has taken the terminal back when it records the stop.
                self.assertEqual(recorded(root / "stop.signal"), signal.SIGSTOP)
                # The held CLI cannot run its listener, so the signal waits in its event loop.
                os.kill(worker, signal.SIGTSTP)
                reader.drain()
                prompt_start = len(transcript)
                os.write(slave, b"[1]+  Stopped\r\n$ ")
                reader.until(b"$ ", prompt_start)
                start = len(transcript)
                # The hold outlasts the interval of the indicator (80 or 120 ms), so its timer is due when the loop runs again.
                time.sleep(.3)
                release.touch()
                deadline = time.monotonic() + 4
                while "T" not in state(worker):
                    self.assertLess(time.monotonic(), deadline)
                    time.sleep(.01)
                # A stopped CLI writes nothing more, so this reads all it wrote after the prompt of the shell.
                reader.drain()
                self.assertEqual(bytes(transcript[start:]), shown)
                os.write(slave, b"fg\r\n")
                reader.until(b"fg", start)
                continued = len(transcript)
                foreground(root, 1)
                reader.until(b"Files created", continued)
                reader.until("└  Project created.".encode(), continued)
                deadline = time.monotonic() + 5
                while time.monotonic() < deadline:
                    finished, status = os.waitpid(pid, os.WNOHANG)
                    if finished:
                        waited = True
                        break
                    time.sleep(.01)
                self.assertTrue(waited)
                reader.drain()
                self.assertEqual(reader.cursor(), shown)
                self.assertEqual(os.waitstatus_to_exitcode(status), 0)
            finally:
                release.touch()
                foreground(root, 1)
                target = recorded(root / "cli.pid") if (root / "cli.pid").exists() else None
                try:
                    if target and os.getsid(target) == pid:
                        os.killpg(target, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                os.close(master)
                os.close(slave)
                if not waited:
                    os.kill(pid, signal.SIGKILL)
                    os.waitpid(pid, 0)

    def test_question_outside_stop(self):
        # A stop the CLI cannot catch, under a parent that puts the terminal back in its own modes as a shell does.
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            pid, master, slave = start_cli(
                root, ["app", "--lang", "en", "--mode", "server", "--no-git", "--no-install"], {}, job_control=True, shell=True)
            reader = Reader(self, master)
            transcript = reader.transcript
            waited = False
            def cooked():
                flags = termios.tcgetattr(slave)[3]
                return all(flags & flag for flag in (termios.ICANON, termios.ECHO, termios.ISIG))
            try:
                reader.until(b"Application title")
                reader.until("└\r\n".encode(), transcript.index(b"Application title"))
                leader = recorded(root / "cli.pid")
                self.assertFalse(cooked())
                before = len(transcript)
                os.kill(leader, signal.SIGSTOP)
                self.assertEqual(recorded(root / "stop.signal"), signal.SIGSTOP)
                self.assertTrue(cooked())
                foreground(root, 1)
                deadline = time.monotonic() + 4
                while cooked():
                    self.assertLess(time.monotonic(), deadline)
                    time.sleep(.01)
                # The second key is read after the loop turn that could have read the signal with the first one.
                for key in (b"a", b"b"):
                    size = len(transcript)
                    os.write(master, key)
                    reader.until(b"\x1b[999D", size)
                # The CLI stopped with the question on screen, so the continue draws nothing.
                self.assertEqual(transcript.count(b"Application title", before), 0)
                self.assertNotIn(b"\x1b[?25", transcript[before:])
                os.write(master, b"\r")
                reader.until("│  ab\r\n".encode(), before)
                reader.until(b"Setup", before)
                os.write(master, b"\x03")
                reader.until("└  Creation canceled.".encode(), before)
                deadline = time.monotonic() + 5
                while time.monotonic() < deadline:
                    finished, status = os.waitpid(pid, os.WNOHANG)
                    if finished:
                        waited = True
                        break
                    time.sleep(.01)
                self.assertTrue(waited)
                self.assertEqual(os.waitstatus_to_exitcode(status), 130)
            finally:
                foreground(root, 1)
                target = recorded(root / "cli.pid") if (root / "cli.pid").exists() else None
                try:
                    if target and os.getsid(target) == pid:
                        os.kill(target, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                os.close(master)
                os.close(slave)
                if not waited:
                    os.kill(pid, signal.SIGKILL)
                    os.waitpid(pid, 0)

    def test_resize_while_stopped(self):
        # A stopped CLI is not in the foreground group, so the terminal does not tell it about the new size.
        for stage in (b"Application title", b"Installing dependencies with Bun"):
            with self.subTest(stage=stage), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                installer = root / "bun"
                installer.write_text('#!/bin/sh\necho $$ > "$PID_FILE"\nsleep 20\n')
                installer.chmod(0o755)
                pid, master, slave = start_cli(
                    root, ["app", "--lang", "en", "--mode", "server", "--no-git", "--install"],
                    {"PID_FILE": str(root / "installer.pid"), "PATH": directory + ":" + os.environ["PATH"]},
                    job_control=True, shell=True)
                reader = Reader(self, master)
                transcript = reader.transcript
                waited = False
                narrow = "Installing dependencies wi…".encode()
                def frames(start):
                    return re.findall(rb"\x1b\[\?7l(.*?)\x1b\[\?7h", bytes(transcript[start:]))
                try:
                    for prompt in [b"Application title", b"Setup", b"Create the project?"]:
                        reader.until(prompt)
                        if prompt == stage:
                            break
                        os.write(master, b"\r")
                    if stage == b"Application title":
                        reader.until("└\r\n".encode(), transcript.index(stage))
                    else:
                        reader.until(stage)
                        self.assertIsNotNone(recorded(root / "installer.pid"))
                    leader = recorded(root / "cli.pid")
                    os.write(master, b"\x1a")
                    self.assertEqual(recorded(root / "stop.signal"), signal.SIGTSTP)
                    self.assertIn("T", state(leader))
                    # A stopped CLI writes nothing more, so this reads all it wrote before the stop.
                    reader.drain()
                    fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 30, 0, 0))
                    continued = len(transcript)
                    foreground(root, 1)
                    if stage == b"Application title":
                        reader.until(stage, continued)
                        reader.until("└\r\n".encode(), transcript.index(stage, continued))
                        # The question breaks a long value at the new width.
                        os.write(master, b"x" * 50)
                        reader.until("│  ".encode() + b"x" * 27 + b"\r\n", continued)
                        os.write(master, b"\r")
                        for prompt in [b"Setup", b"Create the project?"]:
                            reader.until(prompt, continued)
                            os.write(master, b"\r")
                    # Every frame of the indicator after the continue has the title cut at the new width.
                    reader.until(narrow, continued, 3)
                    self.assertEqual({frame.split(b"  ", 1)[1] for frame in frames(continued) if b"Installing" in frame}, {narrow})
                    os.write(master, b"\x03")
                    reader.until("└  Creation canceled.".encode(), continued)
                    deadline = time.monotonic() + 5
                    while time.monotonic() < deadline:
                        finished, status = os.waitpid(pid, os.WNOHANG)
                        if finished:
                            waited = True
                            break
                        time.sleep(.01)
                    self.assertTrue(waited)
                    reader.drain()
                    self.assertEqual(reader.cursor(), b"\x1b[?25h")
                    self.assertEqual(os.waitstatus_to_exitcode(status), 130)
                finally:
                    foreground(root, 1)
                    for file in (root / "installer.pid", root / "cli.pid"):
                        target = recorded(file) if file.exists() else None
                        try:
                            if target and os.getsid(target) == pid:
                                os.kill(target, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                    os.close(master)
                    os.close(slave)
                    if not waited:
                        os.kill(pid, signal.SIGKILL)
                        os.waitpid(pid, 0)

    def test_suspend_as_step_ends(self):
        # HOLD_MODULE keeps the event loop in the last synchronous part of the files step until the script has sent Ctrl+Z.
        # The step ends when the staged tree is renamed, or when a failure removes it.
        for failure in (False, True):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                release = root / "release"
                pid, master, slave = start_cli(
                    root, ["app", "--lang", "en", "--mode", "server", "--no-git", "--no-install"],
                    {"NODE_OPTIONS": "--import=data:text/javascript," + quote(HOLD_MODULE), "HOLD_AT": "rmSync" if failure else "renameSync",
                     "HOLDING": str(root / "holding"), "RELEASE": str(release)},
                    job_control=True, executable=broken_cli(root) if failure else cli)
                reader = Reader(self, master)
                transcript = reader.transcript
                waited = False
                closing = ("▲  Could not create the files" if failure else "◇  Files created").encode()
                try:
                    for prompt in [b"Application title", b"Setup", b"Create the project?"]:
                        reader.until(prompt)
                        os.write(master, b"\r")
                    reader.until(b"Creating the files")
                    self.assertEqual(recorded(root / "holding"), 1)
                    leader = recorded(root / "cli.pid")
                    start = len(transcript)
                    os.write(master, b"\x1a")
                    # The terminal echoes the key when it turns it into the signal.
                    reader.until(b"^Z", start)
                    release.touch()
                    self.assertEqual(recorded(root / "stop.signal"), signal.SIGTSTP)
                    self.assertIn("T", state(leader))
                    # A stopped CLI writes nothing more, so this reads all it wrote before the stop.
                    reader.drain()
                    self.assertEqual(reader.cursor(), b"\x1b[?25h")
                    self.assertNotIn(closing, transcript)
                    os.killpg(leader, signal.SIGCONT)
                    reader.until(("└  Creation stopped." if failure else "└  Project created.").encode(), start)
                    deadline = time.monotonic() + 5
                    while time.monotonic() < deadline:
                        finished, status = os.waitpid(pid, os.WNOHANG)
                        if finished:
                            waited = True
                            break
                        time.sleep(.01)
                    self.assertTrue(waited)
                    reader.drain()
                    self.assertIn(closing, transcript)
                    self.assertEqual(reader.cursor(), b"\x1b[?25h")
                    self.assertEqual(os.waitstatus_to_exitcode(status), int(failure))
                finally:
                    release.touch()
                    target = recorded(root / "cli.pid") if (root / "cli.pid").exists() else None
                    try:
                        if target and os.getsid(target) == pid:
                            os.kill(target, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    os.close(master)
                    os.close(slave)
                    if not waited:
                        os.kill(pid, signal.SIGKILL)
                        os.waitpid(pid, 0)

    def test_suspend_with_closing_key(self):
        # One write puts Ctrl+Z and Enter in the same read at the last question, so the signal is still pending when the question closes.
        for job_control in (True, False):
            with self.subTest(job_control=job_control), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                installer = root / "bun"
                installer.write_text('#!/bin/sh\necho $$ > "$PID_FILE"\nsleep 20\n')
                installer.chmod(0o755)
                pid, master, slave = start_cli(
                    root, ["app", "--lang", "en", "--mode", "server", "--no-git", "--no-install" if job_control else "--install"],
                    {"PID_FILE": str(root / "installer.pid"), "PATH": directory + ":" + os.environ["PATH"]}, job_control)
                reader = Reader(self, master)
                transcript = reader.transcript
                waited = False
                hidden = b"\x1b[?25l"
                shown = b"\x1b[?25h"
                def cooked():
                    flags = termios.tcgetattr(slave)[3]
                    return all(flags & flag for flag in (termios.ICANON, termios.ECHO, termios.ISIG))
                try:
                    for prompt in [b"Application title", b"Setup"]:
                        reader.until(prompt)
                        os.write(master, b"\r")
                    reader.until(b"Create the project?")
                    reader.until("└\r\n".encode(), transcript.index(b"Create the project?"))
                    leader = recorded(root / "cli.pid")
                    start = len(transcript)
                    os.write(master, b"\x1a\r")
                    if job_control:
                        self.assertEqual(recorded(root / "stop.signal"), signal.SIGTSTP)
                        self.assertIn("T", state(leader))
                        # A stopped CLI writes nothing more, so this reads all it wrote before the stop.
                        reader.drain()
                        self.assertEqual(reader.cursor(), shown)
                        self.assertTrue(cooked())
                        self.assertNotIn(b"Creating the files", transcript)
                        os.killpg(leader, signal.SIGCONT)
                        reader.until("└  Project created.".encode(), start)
                    else:
                        # The listener that readline registers for the key must be gone when a step is stopped from outside.
                        reader.until(b"Installing dependencies with Bun", start)
                        self.assertIsNotNone(recorded(root / "installer.pid"))
                        os.kill(leader, signal.SIGSTOP)
                        deadline = time.monotonic() + 4
                        while "T" not in state(leader):
                            self.assertLess(time.monotonic(), deadline)
                            time.sleep(.01)
                        reader.drain()
                        outside = len(transcript)
                        os.killpg(leader, signal.SIGCONT)
                        reader.until(hidden + b"\r\x1b[J\r\x1b[?7l", outside)
                        self.assertTrue(cooked())
                        os.write(master, b"\x03")
                        reader.until("└  Creation canceled.".encode(), outside)
                    deadline = time.monotonic() + 5
                    while time.monotonic() < deadline:
                        finished, status = os.waitpid(pid, os.WNOHANG)
                        if finished:
                            waited = True
                            break
                        time.sleep(.01)
                    self.assertTrue(waited)
                    reader.drain()
                    self.assertEqual(reader.cursor(), shown)
                    self.assertEqual(os.waitstatus_to_exitcode(status), 0 if job_control else 130)
                finally:
                    for file in (root / "installer.pid", root / "cli.pid"):
                        target = recorded(file) if file.exists() else None
                        try:
                            if target and os.getsid(target) == pid:
                                os.kill(target, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                    os.close(master)
                    os.close(slave)
                    if not waited:
                        os.kill(pid, signal.SIGKILL)
                        os.waitpid(pid, 0)

    def test_prompt_signals(self):
        for stage in [b"Application title", b"Create the project?"]:
            for sig in [signal.SIGINT, signal.SIGHUP, signal.SIGTERM]:
                with self.subTest(stage=stage, signal=sig), tempfile.TemporaryDirectory() as directory:
                    installer = pathlib.Path(directory, "bun")
                    installer.write_text("#!/bin/sh\nexit 0\n")
                    installer.chmod(0o755)
                    pid, term = pty.fork()
                    if pid == 0:
                        os.chdir(directory)
                        fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 80, 0, 0))
                        os.environ.update(CI="false", NO_COLOR="1", PATH=directory + ":" + os.environ["PATH"])
                        os.execv(node, [node, str(cli), "app", "--mode", "server", "--lang", "en"])
                    transcript = bytearray()
                    waited = False
                    try:
                        labels = [b"Application title", b"Setup", b"Create the project?"]
                        for label in labels:
                            while label not in transcript:
                                self.assertTrue(select.select([term], [], [], 5)[0], (label, transcript))
                                transcript.extend(os.read(term, 65536))
                            if label == stage:
                                break
                            os.write(term, b"\r")
                        offset = len(transcript)
                        os.kill(pid, sig)
                        while select.select([term], [], [], 5)[0]:
                            try:
                                block = os.read(term, 65536)
                            except OSError:
                                break
                            if not block:
                                break
                            transcript.extend(block)
                        deadline = time.monotonic() + 2
                        while not waited and time.monotonic() < deadline:
                            ended, status = os.waitpid(pid, os.WNOHANG)
                            waited = bool(ended)
                            if not waited:
                                time.sleep(.01)
                        self.assertTrue(waited)
                        self.assertEqual(os.waitstatus_to_exitcode(status), 130)
                        self.assertEqual(re.findall(rb"\x1b\[\?25[hl]", transcript)[-1], b"\x1b[?25h")
                        self.assertEqual(transcript[offset:].decode().replace("\x1b[?25h", "").strip(), "└  Creation canceled.")
                    finally:
                        os.close(term)
                        if not waited:
                            os.kill(pid, signal.SIGKILL)
                            os.waitpid(pid, 0)

    def test_signals(self):
        for interrupt in [signal.SIGTERM, signal.SIGHUP]:
            for install, git in [(False, False), (True, False), (False, True)]:
                with self.subTest(signal=interrupt, install=install, git=git):
                    self.exercise(install, git=git, interrupt=interrupt)

    def test_install_ends_before_signal(self):
        # A signal sent to the group ends the installer too. This holds the event loop until that end and the signal of the CLI are pending in that order.
        hold = """
import { existsSync, writeFileSync } from 'node:fs';
const timer = setInterval(() => {
  if (!existsSync(process.env.HOLD)) return;
  clearInterval(timer);
  writeFileSync(process.env.HOLDING, '1');
  while (!existsSync(process.env.RELEASE)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
}, 10);
timer.unref();
"""
        for interrupt in (signal.SIGTERM, signal.SIGHUP):
            for plain in (False, True):
                with self.subTest(signal=interrupt, plain=plain), tempfile.TemporaryDirectory() as directory:
                    root = pathlib.Path(directory)
                    installer = root / "bun"
                    installer.write_text('#!/bin/sh\necho $$ > "$PID_FILE"\nexec sleep 20\n')
                    installer.chmod(0o755)
                    release = root / "release"
                    pid, master, slave = start_cli(
                        root, ["app", "--lang", "en", "--mode", "server", "--no-git", "--install", *(["--yes"] if plain else [])],
                        {"PID_FILE": str(root / "installer.pid"), "PATH": directory + ":" + os.environ["PATH"],
                         "NODE_OPTIONS": "--import=data:text/javascript," + quote(hold), "HOLD": str(root / "hold"),
                         "HOLDING": str(root / "holding"), "RELEASE": str(release)})
                    reader = Reader(self, master)
                    transcript = reader.transcript
                    waited = False
                    try:
                        for prompt in [] if plain else [b"Application title", b"Setup", b"Create the project?"]:
                            reader.until(prompt)
                            os.write(master, b"\r")
                        reader.until(b"Files created" if plain else b"Installing dependencies with Bun")
                        worker = recorded(root / "installer.pid")
                        (root / "hold").touch()
                        self.assertEqual(recorded(root / "holding"), 1)
                        os.kill(worker, interrupt)
                        # The installer stays a zombie while the CLI cannot reap it, so its end is pending before the next signal is sent.
                        deadline = time.monotonic() + 4
                        while "Z" not in state(worker):
                            self.assertLess(time.monotonic(), deadline)
                            time.sleep(.01)
                        os.kill(pid, interrupt)
                        release.touch()
                        reader.until(b"Creation canceled.")
                        deadline = time.monotonic() + 5
                        while time.monotonic() < deadline:
                            reader.drain()
                            finished, status = os.waitpid(pid, os.WNOHANG)
                            if finished:
                                waited = True
                                break
                            time.sleep(.01)
                        self.assertTrue(waited)
                        self.assertEqual(os.waitstatus_to_exitcode(status), 130)
                        self.assertNotIn(b"Could not install", transcript)
                        self.assertIn(("■ " if plain else "■  ").encode() + b"Installing dependencies with Bun", transcript)
                    finally:
                        release.touch()
                        os.close(master)
                        os.close(slave)
                        if not waited:
                            os.kill(pid, signal.SIGKILL)
                            os.waitpid(pid, 0)
                        target = recorded(root / "installer.pid") if (root / "installer.pid").exists() else None
                        try:
                            if target and os.getsid(target) == pid:
                                os.kill(target, signal.SIGKILL)
                        except ProcessLookupError:
                            pass

    def test_descendant_holding_stderr(self):
        self.exercise(True, interrupt=signal.SIGTERM, descendant=True)

    def test_second_signal(self):
        self.exercise(True, interrupt=signal.SIGTERM, descendant=True, second=True)

    def test_git(self):
        self.exercise(False, git=True)

    def test_files(self):
        self.exercise(False)

    def test_plain_install_cancellation(self):
        self.exercise(True, plain=True)
        self.exercise(True, interrupt=signal.SIGTERM, descendant=True, plain=True)
        self.exercise(True, interrupt=signal.SIGTERM, descendant=True, second=True, plain=True)

    def test_plain_installer_stderr(self):
        for terminal in (False, True):
            for status in (0, 1):
                with self.subTest(terminal=terminal, status=status), tempfile.TemporaryDirectory() as directory:
                    root = pathlib.Path(directory)
                    installer = root / "bun"
                    ending = "\\n" if terminal else ""
                    installer.write_text("#!/bin/sh\nif [ -t 2 ]; then echo tty >&2; else echo pipe >&2; fi\n"
                                         f"printf 'first\\nsecond\\nthird{ending}' >&2\n"
                                         'while [ ! -f "$RELEASE" ]; do sleep .02; done\n'
                                         f"exit {status}\n")
                    installer.chmod(0o755)
                    release = root / "release"
                    env = dict(os.environ, CI="false", NO_COLOR="1", TERM="xterm",
                               PATH=str(root) + ":" + os.environ["PATH"], RELEASE=str(release))
                    master, slave = pty.openpty() if terminal else (None, None)
                    try:
                        with subprocess.Popen([node, cli, "app", "--yes", "--lang", "en", "--no-git"],
                                              cwd=root, env=env, stdin=slave or subprocess.DEVNULL,
                                              stdout=slave or subprocess.PIPE, stderr=slave or subprocess.PIPE) as child:
                            stream = master if terminal else child.stderr.fileno()
                            data = bytearray()
                            deadline = time.monotonic() + 10
                            try:
                                while b"third" not in data:
                                    self.assertTrue(select.select([stream], [], [], max(0, deadline-time.monotonic()))[0], data)
                                    block = os.read(stream, 65536)
                                    self.assertTrue(block, data)
                                    data.extend(block)
                            finally:
                                release.touch()
                                stdout, stderr = child.communicate(timeout=5)
                            if terminal:
                                while select.select([master], [], [], 0)[0]:
                                    data.extend(os.read(master, 65536))
                            else:
                                data.extend(stderr)
                            if not terminal:
                                self.assertIn(b"third\n", data)
                            self.assertNotIn(b"\x1b[?25", data + (stdout or b""))
                            lines = data.decode().splitlines()
                            start = lines.index("first")
                            self.assertEqual(lines[start - 1], "tty" if terminal else "pipe")
                            self.assertEqual(lines[start:start + 3], ["first", "second", "third"])
                            for line in ("first", "second", "third"):
                                self.assertEqual(lines.count(line), 1)
                            self.assertEqual(child.returncode, status)
                            if status:
                                self.assertEqual(lines[start + 3:], ["▲ Could not install dependencies with Bun",
                                    "Your project is in app. To finish, run:", "cd app", "bun install", "", "Creation stopped."])
                            else:
                                closing = "\n".join(lines[start + 3:]) if terminal else stdout.decode()
                                self.assertIn("Dependencies installed with Bun", closing)
                    finally:
                        if terminal:
                            os.close(master)
                            os.close(slave)

    def test_plain_installer_stdout(self):
        for terminal in (False, True):
            for status in (0, 1):
                with self.subTest(terminal=terminal, status=status), tempfile.TemporaryDirectory() as directory:
                    root = pathlib.Path(directory)
                    installer = root / "bun"
                    # The second line ends in bytes that are not UTF-8, and the last one has no newline.
                    installer.write_text("#!/bin/sh\nif [ -t 1 ]; then echo tty; else echo pipe; fi\n"
                                         f"printf 'first\\nsecond \\351\\377\\nthird'\nexit {status}\n")
                    installer.chmod(0o755)
                    env = dict(os.environ, CI="false", NO_COLOR="1", TERM="xterm", PATH=str(root) + ":" + os.environ["PATH"])
                    master, slave = pty.openpty() if terminal else (None, None)
                    try:
                        with subprocess.Popen([node, cli, "app", "--yes", "--lang", "en", "--no-git"], cwd=root, env=env,
                                              stdin=slave or subprocess.DEVNULL, stdout=slave or subprocess.PIPE,
                                              stderr=subprocess.PIPE) as child:
                            if terminal:
                                data = bytearray()
                                deadline = time.monotonic() + 10
                                while child.poll() is None or select.select([master], [], [], 0)[0]:
                                    self.assertLess(time.monotonic(), deadline, data)
                                    if select.select([master], [], [], .05)[0]:
                                        data.extend(os.read(master, 65536))
                                child.stderr.read()
                                # On a terminal the installer keeps the terminal, so its last line is not completed.
                                self.assertIn(b"tty", data.splitlines())
                            else:
                                printed, _ = child.communicate(timeout=10)
                                self.assertIn(b"\npipe\nfirst\nsecond \xe9\xff\nthird\n", printed)
                                if status:
                                    self.assertTrue(printed.endswith(b"third\n"), printed)
                                else:
                                    self.assertIn("third\n◇ Dependencies installed with Bun\n".encode(), printed)
                            self.assertEqual(child.returncode, status)
                    finally:
                        if terminal:
                            os.close(master)
                            os.close(slave)
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            installer = root / "bun"
            size = 4 * 1024 * 1024
            installer.write_text(f"#!/bin/sh\nhead -c {size} /dev/zero | tr '\\0' x\n: > \"$DONE\"\n")
            installer.chmod(0o755)
            done = root / "done"
            env = dict(os.environ, CI="false", NO_COLOR="1", TERM="xterm", PATH=str(root) + ":" + os.environ["PATH"], DONE=str(done))
            with subprocess.Popen([node, cli, "app", "--yes", "--lang", "en", "--no-git"], cwd=root, env=env,
                                  stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as child:
                try:
                    printed = bytearray()
                    deadline = time.monotonic() + 10
                    while b"Files created\n" not in printed:
                        self.assertTrue(select.select([child.stdout], [], [], max(0, deadline-time.monotonic()))[0], printed)
                        printed.extend(os.read(child.stdout.fileno(), 4096))
                    # With nobody reading, the pipes fill and the installer waits. An installer that the CLI did not hold back ends in milliseconds.
                    time.sleep(1)
                    self.assertFalse(done.exists())
                    rest, _ = child.communicate(timeout=20)
                    printed.extend(rest)
                    self.assertTrue(done.exists())
                    self.assertIn(b"\n" + b"x" * size + b"\n" + "◇ Dependencies installed with Bun\n".encode(), printed)
                    self.assertEqual(child.returncode, 0)
                finally:
                    if child.poll() is None:
                        child.kill()
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            installer = root / "bun"
            installer.write_text('#!/bin/sh\ntrap "" INT HUP TERM\nsleep 30 &\necho $! > grandchild.pid\necho started\nwait\n')
            installer.chmod(0o755)
            env = dict(os.environ, CI="false", NO_COLOR="1", TERM="xterm", PATH=str(root) + ":" + os.environ["PATH"])
            with subprocess.Popen([node, cli, "app", "--yes", "--lang", "en", "--no-git"], cwd=root, env=env,
                                  stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as child:
                try:
                    printed = bytearray()
                    deadline = time.monotonic() + 10
                    while b"started\n" not in printed:
                        self.assertTrue(select.select([child.stdout], [], [], max(0, deadline-time.monotonic()))[0], printed)
                        block = os.read(child.stdout.fileno(), 65536)
                        self.assertTrue(block, printed)
                        printed.extend(block)
                    child.send_signal(signal.SIGTERM)
                    # A descendant that keeps the installer's stdout open must not keep the CLI running.
                    self.assertEqual(child.wait(timeout=5), 130)
                finally:
                    grandchild = recorded(root / "app/grandchild.pid") if (root / "app/grandchild.pid").exists() else None
                    if child.poll() is None:
                        child.kill()
                    if grandchild:
                        try:
                            os.kill(grandchild, signal.SIGKILL)
                        except ProcessLookupError:
                            pass

    def test_feature_colors(self):
        with tempfile.TemporaryDirectory() as directory:
            output, status = question_session(directory, "en", [
                ("Application title", b"\r"), ("Setup", b"\x1b[B\r"),
                ("Features", b" "), ("SEO metadata", b"\x1b[B"), ("Light and dark theme switcher", b"\x03")], color=True)
            self.assertEqual(status, 130)
            self.assertIn("\x1b[32m◼", output)
            self.assertIn("\x1b[36m◻", output)
            self.assertIn("\x1b[2m◻", output)
            self.assertIn("\x1b[2m(uncheck to use system fonts)", output)
            canceled = output.rsplit("\x1b[J", 1)[-1]
            self.assertIn("\x1b[9m", canceled)
            plain = re.sub(r"\x1b\[[0-9;?]*[mhl]", "", canceled)
            self.assertIn("Light and dark theme switcher", plain)
            self.assertNotIn("SEO metadata", plain)
            self.assertEqual(plain.rstrip().splitlines()[-2:], ["│", "└  Creation canceled."])

    def test_cancel_whitespace_title(self):
        with tempfile.TemporaryDirectory() as directory:
            output, status = question_session(directory, "en", [
                ("Application title", b"   "), ("   ", b"\x03")])
            final = re.sub(r"\x1b\[\?25[hl]", "", output.rsplit("\x1b[J", 1)[-1])
            self.assertEqual(final.rstrip().splitlines(), [
                "■  Application title", "│     ", "│", "└  Creation canceled."])
            self.assertEqual(status, 130)

    def test_question_cancel(self):
        for language, title, setup, create, no, closing in [
            ("en", "Application title", "Setup", "Create the project?", "No", "Creation canceled."),
            ("es", "Título de la aplicación", "Configuración", "¿Crear el proyecto?", "No", "Creación cancelada."),
        ]:
            for key in (b"\x03", b"\x1b", b"n"):
                with self.subTest(language=language, key=key), tempfile.TemporaryDirectory() as directory:
                    prompts = [(title, key)]
                    expected = [f"■  {title}", "│  app"]
                    if key == b"n":
                        prompts = [(title, b"\r"), (setup, b"\r"), (create, key)]
                        expected = [f"◇  {create}", f"│  {no}"]
                    output, status = question_session(directory, language, prompts)
                    final = re.sub(r"\x1b\[\?25[hl]", "", output.rsplit("\x1b[J", 1)[-1])
                    self.assertEqual(final.rstrip().splitlines(), [*expected, "│", f"└  {closing}"])
                    self.assertEqual(status, 130)

    def test_occupied_directory_question(self):
        path = "a-directory-that-is-longer-than-the-terminal-width"
        for language, question, expected in [
            ("en", "Project directory", ["└  The project directory must be new or", "   empty:"]),
            ("pt-BR", "Pasta do projeto", ["└  A pasta do projeto precisa ser nova", "   ou estar vazia:"]),
            ("es", "Carpeta del proyecto", ["└  La carpeta del proyecto debe ser", "   nueva o estar vacía:"]),
        ]:
            with self.subTest(language=language), tempfile.TemporaryDirectory() as directory:
                destination = pathlib.Path(directory, path)
                destination.mkdir()
                (destination / "existing").touch()
                output, status = question_session(directory, language, [
                    (question, path.encode() + b"\r"), (expected[0], b"\x03")
                ], columns=40, ask_directory=True)
                lines = output.replace("\r\n", "\n")
                self.assertIn("\n".join(["│  " + path[:37], "│  " + path[37:] + "█", *expected, "   " + path[:37], "   " + path[37:]]) + "\n", lines)
                self.assertEqual(status, 130)

                sentence = expected[0] + " " + expected[1].strip()
                output, status = question_session(directory, language, [
                    (question, path.encode() + b"\r"), (sentence, b"\x03")
                ], ask_directory=True)
                self.assertIn(sentence + "\n   " + path + "\n", output.replace("\r\n", "\n"))
                self.assertEqual(status, 130)

                short = pathlib.Path(directory, "app")
                short.mkdir()
                (short / "existing").touch()
                ending = expected[1].strip() + " app"
                output, status = question_session(directory, language, [
                    (question, b"app\r"), (ending, b"\x03")
                ], columns=40, ask_directory=True)
                self.assertIn(expected[0] + "\n   " + ending + "\n", output.replace("\r\n", "\n"))
                self.assertEqual(status, 130)

    def test_resize_occupied_directory_question(self):
        path = "a-directory-that-is-longer-than-the-terminal-width"
        sentence = "└  The project directory must be new or"
        narrow = [sentence, "   empty:", "   " + path[:37], "   " + path[37:]]
        ending = path[37:].encode() + b"\r\n"
        for initial, target, before, after in [
            (80, 40, [sentence + " empty:", "   " + path], narrow),
            (40, 120, narrow, [sentence + " empty: " + path]),
        ]:
            with self.subTest(initial=initial, target=target), tempfile.TemporaryDirectory() as directory:
                destination = pathlib.Path(directory, path)
                destination.mkdir()
                (destination / "existing").touch()
                pid, master, slave = fork_terminal()
                if pid == 0:
                    os.chdir(directory)
                    fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", 40, initial, 0, 0))
                    os.environ.update(CI="false", NO_COLOR="1", TERM="xterm")
                    os.execv(node, [node, str(cli), "--lang", "en", "--mode", "server", "--no-git", "--no-install"])
                screen = Screen(initial)
                waited = False
                def read_render(ending):
                    data = bytearray()
                    deadline = time.monotonic() + 5
                    while not data.endswith(ending):
                        self.assertTrue(select.select([master], [], [], max(0, deadline-time.monotonic()))[0], data)
                        block = os.read(master, 65536)
                        self.assertTrue(block, data)
                        data.extend(block)
                    screen.feed(data.decode())
                def error_rows():
                    rows = screen.lines()
                    rows = rows[next(index for index, row in enumerate(rows) if row.startswith("└")):]
                    while rows and not rows[-1]:
                        rows.pop()
                    return rows
                try:
                    read_render("└\r\n".encode())
                    os.write(master, path.encode() + b"\r")
                    read_render(ending)
                    self.assertEqual(error_rows(), before)
                    screen.resize(target)
                    fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", 40, target, 0, 0))
                    read_render(ending)
                    self.assertEqual(error_rows(), after)
                    os.write(master, b"\x03")
                    read_render("└  Creation canceled.\r\n\r\n".encode())
                    deadline = time.monotonic() + 5
                    while not waited and time.monotonic() < deadline:
                        finished, status = os.waitpid(pid, os.WNOHANG)
                        waited = bool(finished)
                        if not waited:
                            time.sleep(.01)
                    self.assertTrue(waited)
                    self.assertEqual(os.waitstatus_to_exitcode(status), 130)
                finally:
                    os.close(master)
                    os.close(slave)
                    if not waited:
                        os.kill(pid, signal.SIGKILL)
                        os.waitpid(pid, 0)

    def test_long_directory_in_summary(self):
        parent = "a-parent-directory-with-a-long-name/"
        middle = "a-directory-that-is-longer-than-the-terminal-width/"
        name = parent + middle + "app"
        for columns, pieces in [
            (80, [parent, middle + "app"]),
            (40, [parent[:34], parent[34:], middle[:34], middle[34:] + "app"]),
        ]:
            with self.subTest(columns=columns), tempfile.TemporaryDirectory() as directory:
                output, status = question_session(directory, "en", [
                    ("Application title", b"\r"), ("Setup", b"\r"), ("Create the project?", b"\x03")
                ], columns=columns, name=name)
                self.assertEqual(status, 130)
                self.assertEqual("".join(pieces), name)
                lines = output.replace("\r\n", "\n").splitlines()
                top = next(index for index, line in enumerate(lines) if line.startswith("◇  Project summary"))
                bottom = next(index for index, line in enumerate(lines) if line.startswith("├"))
                box = lines[top:bottom + 1]
                self.assertEqual(len({len(line) for line in box}), 1, box)
                self.assertLessEqual(len(box[0]), columns)
                content = [line[3:-1].rstrip() for line in box[1:-1]]
                self.assertTrue(all(line.startswith("│  ") and line.endswith("│") for line in box[1:-1]), box)
                self.assertEqual(content[:len(pieces) + 3], ["", "Project directory:", *pieces, "Application title: app"])

    def test_unknown_screen_bytes(self):
        for text in ("\x1b[1;2H", "\x1b7", "\b"):
            with self.subTest(text=text), self.assertRaises(AssertionError):
                Screen(80).feed(text)

    def test_destination_changes_before_confirmation(self):
        for trigger in ("Configuración", "¿Crear el proyecto?"):
            with self.subTest(trigger=trigger), tempfile.TemporaryDirectory() as directory:
                dest = pathlib.Path(directory) / "app"
                def occupy(label):
                    if label == trigger:
                        dest.mkdir()
                        (dest / "existing").write_text("keep")
                prompts = [("Título de la aplicación", b"\r"), ("Configuración", b"\r")]
                if trigger == "¿Crear el proyecto?":
                    prompts.append((trigger, b"\r"))
                output, status = question_session(directory, "es", prompts, before_answer=occupy, columns=240)
                self.assertEqual(status, 2)
                name = str(dest.resolve()) if trigger == "¿Crear el proyecto?" else "app"
                self.assertEqual(output.replace("\x1b[?25h", "").rstrip().splitlines()[-3:], [
                    f"▲  La carpeta del proyecto debe ser nueva o estar vacía: {name}",
                    "│", "└  Creación interrumpida."])
                self.assertEqual((dest / "existing").read_text(), "keep")

    def test_occupied_destination_in_narrow_frame(self):
        with tempfile.TemporaryDirectory() as directory:
            dest = pathlib.Path(directory) / "app"
            def occupy(label):
                if label == "¿Crear el proyecto?":
                    dest.mkdir()
                    (dest / "existing").write_text("keep")
            output, status = question_session(directory, "es", [
                ("Título de la aplicación", b"\r"), ("Configuración", b"\r"),
                ("¿Crear el proyecto?", b"\r")], before_answer=occupy, columns=40)
            self.assertEqual(status, 2)
            self.assertEqual(output.replace("\x1b[?25h", "").rstrip().splitlines()[-5:], [
                "▲  La carpeta del proyecto debe ser", "│  nueva o estar vacía:",
                f"│  {dest.resolve()}", "│", "└  Creación interrumpida."])
            self.assertEqual((dest / "existing").read_text(), "keep")

    def test_resize_during_install(self):
        self.resize_install(((80, 30), (30, 80)))

    def test_resize_during_pending_window_change(self):
        self.resize_install(((80, 30),), drag=True)

    def resize_install(self, sizes, drag=False):
        self.assertIsNotNone(shutil.which("tmux"), "The resize tests of the questionnaire harness need tmux: install it and run again")
        for old, new in sizes:
            with self.subTest(old=old, new=new), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                installer = root / "bun"
                installer.write_text('#!/bin/sh\necho $$ > "$PID_FILE"\nexec sleep 20\n')
                installer.chmod(0o755)
                socket = str(root / "tmux.sock")
                tmux_env = {key: os.environ[key] for key in ("HOME", "PATH", "LANG", "TMPDIR") if key in os.environ}
                def tmux(*args):
                    return subprocess.check_output(["tmux", "-f", "/dev/null", "-S", socket, *args], env=tmux_env, text=True, timeout=5)
                def capture():
                    return tmux("capture-pane", "-p", "-S", "-1000")
                def wait_for(label):
                    deadline = time.monotonic() + 10
                    while time.monotonic() < deadline:
                        screen = capture()
                        if label in screen:
                            return screen
                        time.sleep(.04)
                    self.fail((label, screen))
                tmux("new-session", "-d", "-x", str(old), "-y", "80", "-c", directory, "/bin/sh")
                try:
                    command = shlex.join(["env", "CI=false", "NO_COLOR=1", "TERM=xterm",
                        f"PID_FILE={root / 'pid'}", f"PATH={root}:{os.environ['PATH']}",
                        node, str(cli), "app", "--lang", "en", "--mode", "server", "--git", "--install"])
                    tmux("set-option", "remain-on-exit", "on")
                    tmux("respawn-pane", "-k", "-c", directory, "exec " + command)
                    for label in ("Application title", "Setup", "Create the project?"):
                        wait_for(label)
                        tmux("send-keys", "Enter")
                    wait_for("Installing dependencies")
                    if drag:
                        tmux("resize-window", "-x", "50", "-y", "80")
                    tmux("resize-window", "-x", str(new), "-y", "80")
                    wait_for("Installing dependencies wi…" if new == 30 else "Installing dependencies with Bun")
                    tmux("send-keys", "C-c")
                    screen = wait_for("└  Creation canceled.").splitlines()
                    start = screen.index("◇  Files created")
                    end = next(i for i in range(start,len(screen)) if screen[i].startswith("■"))
                    self.assertEqual(screen[start:end], ["◇  Files created", "◇  Git repository created"])
                    for line in screen[start:end]:
                        self.assertEqual(screen.count(line), 1)
                finally:
                    tmux("kill-server")

    def test_success(self):
        self.exercise(True, success=True)

    def test_git_warning(self):
        self.exercise(True, git=True, git_warning=True)

    def test_files_failure(self):
        self.exercise(False, files_failure=True)

    def test_install_failure(self):
        self.exercise(True, failure=True)

    def test_narrow_install(self):
        for columns in (30, 36):
            with self.subTest(columns=columns):
                self.exercise(True, columns=columns)

    def test_install(self):
        self.exercise(True)


unittest.main()
