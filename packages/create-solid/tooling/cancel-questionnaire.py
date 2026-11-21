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
    def exercise(self, install, failure=False, git=False, interrupt=None):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            bun = root / ("git" if git else "bun")
            bun.write_text('#!/bin/sh\nif [ "$1" = install ]; then echo $$ > "$PID_FILE"; exec sleep 20; fi\n')
            if git:
                bun.write_text('#!/bin/sh\necho $$ > "$PID_FILE"\nexec sleep 20\n')
            if failure:
                bun.write_text('#!/bin/sh\nif [ "$1" = install ]; then for line in discarded-line one two three four five registry-failure; do echo "$line" >&2; done; exit 1; fi\n')
            bun.chmod(0o755)
            pid, terminal = pty.fork()
            if pid == 0:
                os.chdir(root)
                fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 80, 0, 0))
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
                if failure:
                    self.assertEqual(os.waitstatus_to_exitcode(status), 1)
                    self.assertIn("■  Installing".encode(), transcript)
                    self.assertIn("│  Open parent/app".encode(), transcript)
                    self.assertIn("└".encode(), transcript.split(b"registry-failure")[-1])
                    self.assertIn(b"registry-failure", transcript)
                    self.assertNotIn(b"discarded-line", transcript)
                    self.assertIn(b"Open parent/app and run bun install again.", transcript)
                    return
                self.assertEqual(transcript.count(b"Creation canceled."), 1)
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

    def test_install(self):
        self.exercise(True)


unittest.main()
