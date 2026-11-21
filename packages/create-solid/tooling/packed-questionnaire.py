"""Exercise the extracted CLI with a real terminal on Linux and macOS."""

import errno
import fcntl
import struct
import termios
import os
import pathlib
import pty
import re
import select
import subprocess
import sys
import time
from urllib.parse import quote

root = pathlib.Path.cwd()
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 80, 0, 0))
environment = dict(os.environ, NO_COLOR="1", TERM="xterm")
if len(sys.argv) > 2:
    environment["CI"] = sys.argv[2]
else:
    environment.pop("CI", None)
project = "interactive-" + environment.get("CI", "unset")
has_color = environment.get("CI") == "false"
should_cancel = environment.get("CI") == "0"
if has_color:
    environment.pop("NO_COLOR", None)
    environment["FORCE_COLOR"] = "1"
args = [
    sys.argv[1], "package/dist/create-solid.mjs", project, "--lang", "en",
    "--mode", "server", "--pm", "bun", "--no-i18n", "--base-locale", "en",
    "--no-seo", "--theme", "--fonts", "--icons", "--diagnostics",
    "--no-git", "--no-install",
]
if should_cancel:
    # A delayed confirmation exposes any Enter sent while the terminal is quiet.
    delay = """
const write = process.stdout.write.bind(process.stdout);
process.stdout.write = (...args) => {
  if (String(args[0]).includes('Create the project?')) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 700);
  }
  return write(...args);
};
"""
    args.insert(1, "--import=data:text/javascript," + quote(delay))
transcript = bytearray()
prompts = iter([(b"Application title", b"\r"), (b"Setup", b"\r"),
                (b"Create the project?", b"n" if should_cancel else b"\r")])
pending = next(prompts)
offset = 0
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
                    if pending and pending[0] in transcript[offset:]:
                        offset = len(transcript)
                        os.write(master, pending[1])
                        pending = next(prompts, None)
            child.wait(timeout=1)
        finally:
            if child.poll() is None:
                child.kill()
        output = transcript.decode(errors="replace")
        plain = re.sub(r"\x1b\[[0-9;:]*m", "", output)
        assert any(color in output for color in ["\x1b[38;2;68;107;158m", "\x1b[38;5;67m"]) == has_color, output
        assert has_color or plain == output, output
        assert re.search(r"\x1b\[[?0-9;]*[ABCDEFGHJKhl]", output), output
        labels = ["Solid Base v", "Start a Solid 2 application with Vite+, TypeScript and tests set up.",
                  "Application title", "Project settings", "Create the project?"]
        labels += ["Creation canceled."] if should_cancel else [
            "Creating the files", "Files created", "Next steps", "Project created."
        ]
        previous = -1
        for label in labels:
            found = plain.find(label, previous + 1)
            assert found > previous, (label, plain)
            previous = found
        if should_cancel:
            assert plain.count("Creation canceled.") == 1, plain
            assert child.returncode == 130 and not (root / project).exists(), output
        else:
            assert child.returncode == 0 and (root / project / "package.json").is_file(), output
finally:
    os.close(master)
