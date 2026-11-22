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


def question_session(directory, language, prompts, before_answer=None, color=False, columns=80, piped=False, ask_directory=False):
    master, slave = pty.openpty()
    try:
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, columns, 0, 0))
        with subprocess.Popen([node, cli, *([] if ask_directory else ["app"]), "--lang", language, "--mode", "server",
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
                dist = root / "package/dist"
                shutil.copytree(cli.parent, dist)
                (dist.parent / "template").symlink_to(cli.parent.parent / "template")
                settings = dist / "settings.json"
                settings.write_text(settings.read_text().replace('"@evertondgn/solid-runtime":', '"absent":'))
                executable = dist / cli.name
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
                    while not (root / "pid").exists() and time.monotonic() < deadline:
                        time.sleep(.01)
                    self.assertTrue((root / "pid").exists())
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
                    closing = transcript.decode().rstrip().splitlines()[-6:]
                    closing[0] = closing[0].removeprefix("^C")
                    self.assertEqual(closing, [
                        "■ Installing dependencies with Bun", "Your project is in parent/app. To finish, run:",
                        "cd parent/app", "bun install", "", "Creation canceled."])
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
                        os.kill(int((root / "pid").read_text()), 0)
                else:
                    self.assertFalse((root / "parent").exists())
            finally:
                grandchild_file = root / "parent/app/grandchild.pid"
                if grandchild_file.exists():
                    grandchild = int(grandchild_file.read_text())
                    try:
                        if os.getsid(grandchild) == pid:
                            os.kill(grandchild, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                os.close(terminal)
                if not waited:
                    os.kill(pid, signal.SIGKILL)
                    os.waitpid(pid, 0)
                if (root / "pid").exists():
                    installer = int((root / "pid").read_text())
                    try:
                        if os.getsid(installer) == pid:
                            os.kill(installer, signal.SIGKILL)
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
        for key, job_control in [(b"\x1a", False), (b"\x1a", True), (b"\x1c", False)]:
            with self.subTest(key=key, job_control=job_control), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                installer = root / "bun"
                # The shell stays as the installer: a stop signal sent while it replaced itself with sleep was lost.
                installer.write_text('#!/bin/sh\necho $$ > "$PID_FILE"\nsleep 20\n')
                installer.chmod(0o755)
                pid, master, slave = fork_terminal()
                if pid == 0:
                    os.chdir(root)
                    if job_control:
                        # Keep a parent in this session but outside the foreground group.
                        reader, writer = os.pipe()
                        child = os.fork()
                        if child:
                            os.close(reader)
                            os.setpgid(child, child)
                            os.tcsetpgrp(0, child)
                            os.write(writer, b"x")
                            os.close(writer)
                            _, status = os.waitpid(child, os.WUNTRACED)
                            if not os.WIFSTOPPED(status):
                                os._exit(1)
                            (root / "stop.signal").write_text(str(os.WSTOPSIG(status)))
                            _, status = os.waitpid(child, 0)
                            os._exit(os.waitstatus_to_exitcode(status))
                        os.close(writer)
                        os.read(reader, 1)
                        os.close(reader)
                    (root / "cli.pid").write_text(str(os.getpid()))
                    fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 80, 0, 0))
                    os.environ.update(CI="false", NO_COLOR="1", TERM="xterm", PID_FILE=str(root / "installer.pid"), PATH=directory + ":" + os.environ["PATH"])
                    os.execv(node, [node, str(cli), "app", "--lang", "en", "--mode", "server", "--no-git", "--install"])
                transcript = bytearray()
                waited = False
                def read_until(marker, start=0):
                    deadline = time.monotonic() + 8
                    while marker not in transcript[start:]:
                        self.assertTrue(select.select([master], [], [], max(0, deadline-time.monotonic()))[0], transcript)
                        block = os.read(master, 65536)
                        self.assertTrue(block, transcript)
                        transcript.extend(block)
                def assert_cleared(start):
                    end = transcript.index(b"\x1b[?25h", start)
                    frame = transcript.rindex(b"Installing dependencies with Bun", 0, end)
                    self.assertIn(b"\r\x1b[J", transcript[frame:end])
                def state(process):
                    return subprocess.check_output(["ps", "-o", "stat=", "-p", str(process)], text=True).strip()
                def recorded(name):
                    # A file exists before its content is written.
                    deadline = time.monotonic() + 4
                    while not ((root / name).exists() and (root / name).read_text()) and time.monotonic() < deadline:
                        time.sleep(.01)
                    return int((root / name).read_text())
                def drain():
                    while select.select([master], [], [], 0)[0]:
                        try:
                            block = os.read(master, 65536)
                        except OSError as error:
                            if error.errno != errno.EIO:
                                raise
                            break
                        if not block:
                            break
                        transcript.extend(block)
                try:
                    for prompt in [b"Application title", b"Setup", b"Create the project?"]:
                        read_until(prompt)
                        os.write(master, b"\r")
                    read_until(b"Installing dependencies with Bun")
                    worker = recorded("installer.pid")
                    leader = int((root / "cli.pid").read_text())
                    self.assertEqual(os.getsid(leader), pid)
                    self.assertEqual(os.getpgid(worker), leader)
                    self.assertEqual(os.getpgid(leader), leader)
                    start = len(transcript)
                    os.write(master, key)
                    read_until(b"\x1b[?25h", start)
                    assert_cleared(start)
                    if key == b"\x1a":
                        hidden = b"\x1b[?25l"
                        shown = b"\x1b[?25h"
                        if job_control:
                            self.assertEqual(recorded("stop.signal"), signal.SIGTSTP)
                            self.assertIn("T", state(leader))
                            self.assertIn("T", state(worker))
                            # A stopped CLI writes nothing more, so this reads all it wrote before the stop.
                            drain()
                            self.assertEqual(re.findall(rb"\x1b\[\?25[hl]", transcript[start:])[-1], shown)
                            os.killpg(leader, signal.SIGCONT)
                        for attempt in range(1 if job_control else 2):
                            if attempt:
                                start = len(transcript)
                                os.write(master, key)
                                read_until(shown, start)
                                assert_cleared(start)
                            after_show = transcript.index(shown, start) + len(shown)
                            read_until(hidden, after_show)
                            read_until(b"Installing dependencies with Bun", transcript.index(hidden, after_show))
                            self.assertNotIn("T", state(leader))
                            self.assertNotIn("T", state(worker))
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
                    self.assertEqual(re.findall(rb"\x1b\[\?25[hl]", transcript)[-1], b"\x1b[?25h")
                    self.assertEqual(os.waitstatus_to_exitcode(status), 130 if key == b"\x1a" else -signal.SIGQUIT)
                    if key == b"\x1c":
                        tail = transcript[transcript.index(b"\x1b[?25h", start):]
                        self.assertNotIn(b"Installing dependencies with Bun", tail)
                        self.assertNotIn("└".encode(), tail)
                        self.assertNotIn(b"Creation canceled.", transcript)
                finally:
                    for file in ("installer.pid", "cli.pid"):
                        if (root / file).exists():
                            target = int((root / file).read_text())
                            try:
                                if os.getsid(target) == pid:
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
            for sig in [signal.SIGHUP, signal.SIGTERM]:
                with tempfile.TemporaryDirectory() as directory:
                    pid, term = pty.fork()
                    if pid == 0:
                        os.chdir(directory)
                        fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 80, 0, 0))
                        os.environ.update(CI="false", NO_COLOR="1")
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
                        self.assertIn(b"\x1b[?25h", transcript[offset:])
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
                self.assertIn("\n".join([*expected, "   " + path[:37], path[37:]]) + "\n", lines)
                self.assertEqual(status, 130)

                short = pathlib.Path(directory, "app")
                short.mkdir()
                (short / "existing").touch()
                ending = expected[1].strip() + " app"
                output, status = question_session(directory, language, [
                    (question, b"app\r"), (ending, b"\x03")
                ], columns=40, ask_directory=True)
                self.assertIn(expected[0] + " \n" + ending + "\n", output.replace("\r\n", "\n"))
                self.assertEqual(status, 130)

    def test_resize_occupied_directory_question(self):
        path = "a-directory-that-is-longer-than-the-terminal-width"
        sentence = "└  The project directory must be new or"
        narrow = [sentence, "   empty:", "   " + path[:37], path[37:]]
        ending = path[37:].encode() + b"\r\n"
        for initial, target, before, after in [
            (80, 40, [sentence + " empty: ", path], narrow),
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
