"""Exercise the extracted CLI with a real terminal on Linux and macOS."""

import errno
import os
import pathlib
import pty
import select
import subprocess
import sys
import time

root = pathlib.Path.cwd()
master, slave = pty.openpty()
environment = dict(os.environ, NO_COLOR="1", TERM="xterm")
environment.pop("CI", None)
args = [
    sys.argv[1], "package/dist/create-solid.mjs", "interactive", "--lang", "en",
    "--mode", "server", "--pm", "bun", "--no-i18n", "--base-locale", "en",
    "--no-seo", "--theme", "--fonts", "--icons", "--diagnostics",
    "--no-git", "--no-install",
]
transcript = bytearray()
try:
    with subprocess.Popen(args, stdin=slave, stdout=slave, stderr=slave,
                          env=environment) as child:
        os.close(slave)
        deadline = time.monotonic() + 30
        try:
            while time.monotonic() < deadline:
                if select.select([master], [], [], 0.2)[0]:
                    try:
                        block = os.read(master, 65536)
                    except OSError as error:
                        if error.errno != errno.EIO:
                            raise
                        break
                    if not block:
                        break
                    transcript.extend(block)
                elif child.poll() is None and transcript:
                    os.write(master, b"\r")
            child.wait(timeout=1)
        finally:
            if child.poll() is None:
                child.kill()
        output = transcript.decode(errors="replace")
        if child.returncode or "Solid Base" not in output or not (root / "interactive/package.json").is_file():
            raise RuntimeError(output)
finally:
    os.close(master)
