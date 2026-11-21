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
    def exercise(self, install):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            bun = root / "bun"
            bun.write_text('#!/bin/sh\nif [ "$1" = install ]; then echo $$ > "$PID_FILE"; exec sleep 20; fi\n')
            bun.chmod(0o755)
            pid, terminal = pty.fork()
            if pid == 0:
                os.chdir(root)
                fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 80, 0, 0))
                os.environ.update(CI="false", NO_COLOR="1", PID_FILE=str(root / "pid"),
                                  PATH=str(root) + ":" + os.environ["PATH"])
                os.execv(node, [node, str(cli), "parent/app", "--lang", "en",
                                "--mode", "server", "--no-git", "--install" if install else "--no-install"])
            transcript = bytearray()
            waited = False
            try:
                for label in [b"Application title", b"Setup", b"Create the project?",
                              b"Installing" if install else b"Creating"]:
                    deadline = time.monotonic() + 10
                    while label not in transcript:
                        self.assertTrue(select.select([terminal], [], [], max(0, deadline-time.monotonic()))[0], transcript)
                        transcript.extend(os.read(terminal, 65536))
                    if label in [b"Creating", b"Installing"]:
                        break
                    os.write(terminal, b"\r")
                if install:
                    while not (root / "pid").exists() and time.monotonic() < deadline:
                        time.sleep(.01)
                    self.assertTrue((root / "pid").exists())
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
                self.assertEqual(os.waitstatus_to_exitcode(status), 130)
                if install:
                    self.assertIn(b"bun install", transcript)
                    self.assertTrue((root / "parent/app/package.json").exists())
                    with self.assertRaises(ProcessLookupError):
                        os.kill(int((root / "pid").read_text()), 0)
                else:
                    self.assertFalse((root / "parent").exists())
            finally:
                if not waited:
                    os.kill(pid, signal.SIGKILL)
                    os.waitpid(pid, 0)
                if (root / "pid").exists():
                    try:
                        os.kill(int((root / "pid").read_text()), signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                os.close(terminal)

    def test_files(self):
        self.exercise(False)

    def test_install(self):
        self.exercise(True)


unittest.main()
