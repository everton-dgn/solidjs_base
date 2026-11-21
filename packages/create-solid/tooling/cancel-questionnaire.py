"""Check Ctrl+C with the CLI in the foreground of a controlling terminal."""

import fcntl
import struct
import os
import pathlib
import pty
import select
import shutil
import signal
import sys
import tempfile
import termios
import time
import unittest

cli = pathlib.Path(sys.argv.pop(1)).resolve()
node = shutil.which("node")


class Cancellation(unittest.TestCase):
    def exercise(self, install, failure=False, git=False, interrupt=None, columns=80):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            bun = root / ("git" if git else "bun")
            bun.write_text('#!/bin/sh\nif [ "$1" = install ]; then echo $$ > "$PID_FILE"; exec sleep 20; fi\n')
            if interrupt and install:
                bun.write_text('#!/bin/sh\ntrap "" INT\necho $$ > "$PID_FILE"\nexec sleep 20\n')
            if git:
                bun.write_text('#!/bin/sh\necho $$ > "$PID_FILE"\nexec sleep 20\n')
            if failure:
                bun.write_text('#!/bin/sh\nif [ "$1" = install ]; then for line in discarded-line one two three four five registry-failure; do echo "$line" >&2; done; exit 1; fi\n')
            bun.chmod(0o755)
            pid, terminal = pty.fork()
            if pid == 0:
                os.chdir(root)
                fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", 40, columns, 0, 0))
                os.environ.update(CI="false", NO_COLOR="1", PID_FILE=str(root / "pid"),
                                  PATH=str(root) + ":" + os.environ["PATH"])
                os.execv(node, [node, str(cli), "parent/app", "--lang", "en",
                                "--mode", "server", "--git" if git else "--no-git", "--install" if install else "--no-install"])
            transcript = bytearray()
            waited = False
            try:
                for label in [b"Application title", b"Setup", b"Create the project?",
                              b"Installing" if install else (b"Creating the Git repository" if git else b"Creating the files")]:
                    deadline = time.monotonic() + 10
                    while label not in transcript:
                        self.assertTrue(select.select([terminal], [], [], max(0, deadline-time.monotonic()))[0], transcript)
                        transcript.extend(os.read(terminal, 65536))
                    if label in [b"Creating the files", b"Creating the Git repository", b"Installing"]:
                        break
                    os.write(terminal, b"\r")
                if (install or git) and not failure:
                    while not (root / "pid").exists() and time.monotonic() < deadline:
                        time.sleep(.01)
                    self.assertTrue((root / "pid").exists())
                if interrupt:
                    os.kill(pid, interrupt)
                elif not failure:
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
                if columns == 30:
                    self.assertIn("Installing dependencies wi…".encode(), transcript)
                    self.assertNotIn(b"Installing dependencies with Bun", transcript)
                if failure:
                    self.assertEqual(os.waitstatus_to_exitcode(status), 1)
                    self.assertIn("▲  Could not install dependencies with Bun".encode(), transcript)
                    self.assertIn("│  Your project is in parent/app. To finish, run:".encode(), transcript)
                    self.assertIn("└  Creation stopped.".encode(), transcript.split(b"registry-failure")[-1])
                    self.assertIn(b"registry-failure", transcript)
                    self.assertNotIn(b"discarded-line", transcript)
                    self.assertIn("│  cd parent/app\r\n│  bun install".encode(), transcript)
                    return
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

    def test_git(self):
        self.exercise(False, git=True)

    def test_files(self):
        self.exercise(False)

    def test_install_failure(self):
        self.exercise(True, failure=True)

    def test_narrow_install(self):
        self.exercise(True, columns=30)

    def test_install(self):
        self.exercise(True)


unittest.main()
