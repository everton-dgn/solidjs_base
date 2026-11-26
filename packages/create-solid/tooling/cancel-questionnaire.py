"""Check Ctrl+C with the CLI in the foreground of a controlling terminal."""

import errno
import fcntl
import itertools
import json
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
found_node = shutil.which("node")
if not found_node:
    sys.exit("The questionnaire harness needs node: install it and run again")
# The node of PATH may be the shim of a version manager, which would add a process of its own to every job.
node = subprocess.check_output([found_node, "-p", "process.execPath"], text=True).strip()


# A test writes this through the slave once the CLI has stopped, and reads up to it. The terminal hands its output over in
# the order it was written, so all the CLI wrote before the stop comes before the mark. The screen model ignores it.
MARK = b"\x1b[?9999h"


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
            elif sequence in ("\x1b[?25h", "\x1b[?25l", MARK.decode()):
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


# A launcher with the default action of SIGINT: like dash, the /bin/sh of Ubuntu, it dies at once on Ctrl+C.
DYING_LAUNCHER = "const c = require('child_process').spawn(process.argv[1], process.argv.slice(2), { stdio: 'inherit' }); c.on('exit', code => process.exit(code ?? 1))"
# A launcher that sends the CLI the SIGINT and SIGTERM it gets, as the signal manager of npm does for the bin of npx.
FORWARDING_LAUNCHER = "const c = require('child_process').spawn(process.argv[1], process.argv.slice(2), { stdio: 'inherit' }); for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => c.kill(s)); c.on('exit', code => process.exit(code ?? 1))"
# An installer that starts its cleanup on its first SIGINT, SIGTERM or SIGHUP and ends it once the script creates the FINISH
# file, or CLEANUP_MS after it started when that is set. With SIGNALS it records each of these signals and when it came.
CLEANING_INSTALLER = """
const { appendFileSync, existsSync, writeFileSync } = require('node:fs');
const now = () => (performance.timeOrigin + performance.now()).toFixed(1);
writeFileSync(process.env.PID_FILE, String(process.pid));
let isCleaning = false;
const clean = name => {
  if (process.env.SIGNALS) appendFileSync(process.env.SIGNALS, `${name} ${now()}\\n`);
  if (isCleaning) return;
  isCleaning = true;
  writeFileSync(process.env.CLEANING, '1');
  const started = performance.now();
  setInterval(() => {
    const isDone = process.env.CLEANUP_MS
      ? performance.now() - started >= Number(process.env.CLEANUP_MS)
      : existsSync(process.env.FINISH);
    if (!isDone) return;
    writeFileSync(process.env.CLEANED, now());
    process.exit(130);
  }, 10);
};
for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(name, clean);
setInterval(() => {}, 1000);
"""
# The CLI forces an installer that has not ended this long after the first signal (cleanupLimitMs in src/generate.ts).
CLEANUP_LIMIT_S = 8
# Once the installer has exited, the CLI lets go of its pipes when nothing came for this long while its output took what came
# (quietMs in src/settlePipes).
PIPE_DRAIN_S = .5
# After its SIGKILL, the CLI waits this long for the installer to exit before it lets it go (killWaitMs).
KILL_WAIT_S = 1
# The waiting line, the same after any first signal: the CLI cannot tell a SIGINT sent with kill from Ctrl+C.
WAITING_LINE = "Press Ctrl+C to stop Bun now. Waiting for it to clean up."
ERROR_WAITING_LINE = "Waiting for Bun to clean up."
# An entry that runs the CLI and records its exit code, which a launcher that died cannot report. With CLI_SIGNALS it also
# records each SIGHUP, SIGINT and SIGTERM the CLI gets and when, from a listener that runs before those of the CLI. With
# CLI_CHILDREN it records each signal the CLI sends to a process it started, and how and when that process ended, with
# whether the standard output of the CLI asked for drain then and the bytes waiting in it. With
# CLI_INPUT it records when the input of the CLI ends and each error it emits, with its code and the call that failed. With
# CLI_UNKILLABLE as well as CLI_CHILDREN, the SIGKILL the CLI sends never reaches the process, as for one in a wait that nothing
# interrupts.
EXIT_ENTRY = """
import childProcess from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const now = () => (performance.timeOrigin + performance.now()).toFixed(1);
process.on('exit', code => writeFileSync(process.env.EXIT_FILE, String(code)));
for (const name of process.env.CLI_SIGNALS ? ['SIGHUP', 'SIGINT', 'SIGTERM'] : []) process.on(name, () => {
  appendFileSync(process.env.CLI_SIGNALS, `${name} ${now()}\\n`);
});
if (process.env.CLI_CHILDREN) {
  const record = line => appendFileSync(process.env.CLI_CHILDREN, `${line} ${now()}\\n`);
  const spawn = childProcess.spawn;
  childProcess.spawn = (...args) => {
    const child = spawn(...args);
    const kill = child.kill.bind(child);
    child.kill = name => {
      record(`kill ${name ?? 'SIGTERM'}`);
      return name === 'SIGKILL' && process.env.CLI_UNKILLABLE ? true : kill(name);
    };
    child.on('exit', (code, name) => record(`exit ${code} ${name} ${process.stdout.writableNeedDrain} ${process.stdout.writableLength}`));
    return child;
  };
  syncBuiltinESMExports();
}
if (process.env.CLI_INPUT) {
  const input = process.stdin;
  const emit = input.emit;
  input.emit = function (name, ...args) {
    const [error] = args;
    if (name === 'end') appendFileSync(process.env.CLI_INPUT, `end ${now()}\\n`);
    if (name === 'error') appendFileSync(process.env.CLI_INPUT, `error ${error?.code} ${error?.syscall} ${now()}\\n`);
    return Reflect.apply(emit, this, [name, ...args]);
  };
}
await import(process.env.CLI_URL);
"""


def bash_path():
    """The bash of the system, /bin/bash, when it exists, and otherwise the first bash of PATH."""
    return "/bin/bash" if os.path.exists("/bin/bash") else shutil.which("bash")


def start_cli(root, arguments, environment, job_control=False, launcher=False, executable=cli, shell=False, stay=False, stdout=None):
    """Fork the CLI on a new terminal: alone in its session, under a parent that waits like a shell with job control, or under a shell of its own group.

    With stdout, the standard output of the CLI goes to that descriptor instead of the terminal, as with | cat.

    With shell, that parent also takes the terminal back on every stop, as a shell does, and gives it back with SIGCONT when the script calls foreground.
    With stay, it also takes the terminal back when the launcher ends and stays until the CLI records its exit code in cli.exit.
    launcher is True for bash -c, "dies" for a launcher that dies on SIGINT or "forwards" for one that forwards SIGINT and SIGTERM."""
    # bash keeps waiting on Ctrl+C and exits with the code of the CLI; dash, the /bin/sh of Ubuntu, dies at once.
    # The check runs here because a failure in the forked child would not reach the test.
    bash = bash_path()
    if launcher is True and not bash:
        raise AssertionError("The launcher tests of the questionnaire harness need bash: install it and run again")
    pid, master, slave = fork_terminal()
    if pid == 0:
        os.chdir(root)
        if stdout is not None:
            os.dup2(stdout, 1)
        if job_control:
            # Keep a parent in this session but outside the foreground group.
            modes = termios.tcgetattr(0)
            reader, writer = os.pipe()
            child = os.fork()
            if child:
                code = 1
                try:
                    os.close(reader)
                    # A process outside the foreground group that changes the terminal gets SIGTTOU, and a shell ignores it.
                    signal.signal(signal.SIGTTOU, signal.SIG_IGN)
                    os.setpgid(child, child)
                    os.tcsetpgrp(0, child)
                    os.write(writer, b"x")
                    os.close(writer)
                    _, status = os.waitpid(child, os.WUNTRACED)
                    if not os.WIFSTOPPED(status) and not stay:
                        os._exit(1)
                    stops = 1
                    while shell and os.WIFSTOPPED(status):
                        os.tcsetpgrp(0, os.getpgrp())
                        termios.tcsetattr(0, termios.TCSANOW, modes)
                        (root / ("stop.signal" if stops == 1 else f"stop.{stops}.signal")).write_text(str(os.WSTOPSIG(status)))
                        # Longer than every wait of a test, so only a test that ended without calling foreground reaches it.
                        deadline = time.monotonic() + 30
                        while not (root / f"foreground.{stops}").exists():
                            if time.monotonic() > deadline:
                                raise TimeoutError(f"foreground.{stops} never came")
                            time.sleep(.005)
                        os.tcsetpgrp(0, child)
                        os.killpg(child, signal.SIGCONT)
                        stops += 1
                        _, status = os.waitpid(child, os.WUNTRACED)
                    if not shell:
                        (root / "stop.signal").write_text(str(os.WSTOPSIG(status)))
                        _, status = os.waitpid(child, 0)
                    code = os.waitstatus_to_exitcode(status)
                    if stay:
                        os.tcsetpgrp(0, os.getpgrp())
                        termios.tcsetattr(0, termios.TCSANOW, modes)
                        (root / "launcher.ended").write_text(str(code))
                        recorded(root / "cli.exit")
                finally:
                    # This copy of the test process must never return into the test runner, whatever fails above.
                    os._exit(code)
            os.close(writer)
            os.read(reader, 1)
            os.close(reader)
        (root / "cli.pid").write_text(str(os.getpid()))
        fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 80, 0, 0))
        os.environ.update(CI="false", NO_COLOR="1", TERM="xterm", **environment)
        command = [node, str(executable), *arguments]
        if launcher in ("dies", "forwards"):
            os.execv(node, [node, "-e", DYING_LAUNCHER if launcher == "dies" else FORWARDING_LAUNCHER, *command])
        if launcher:
            # A second command keeps the shell above the CLI, in its group, as npx and pnpm dlx stay.
            os.execv(bash, [bash, "-c", shlex.join(command) + "; exit $?"])
        os.execv(node, command)
    return pid, master, slave


def foreground(root, stop):
    """Play fg for the given stop of a CLI started with shell."""
    (root / f"foreground.{stop}").touch()


def system_tool(*command):
    """Run ps or pgrep, failing with a message that names the tool when it is missing, as minimal images lack both."""
    try:
        return subprocess.check_output(command, text=True)
    except FileNotFoundError:
        raise AssertionError(f"The questionnaire harness needs {command[0]}: install it and run again") from None


def state(process):
    return system_tool("ps", "-o", "stat=", "-p", str(process)).strip()


def children(process):
    return [int(child) for child in system_tool("pgrep", "-P", str(process)).split()]


def broken_cli(root):
    """Copy the CLI with a setting that makes the files step fail."""
    dist = root / "package/dist"
    shutil.copytree(cli.parent, dist)
    (dist.parent / "template").symlink_to(cli.parent.parent / "template")
    settings = dist / "settings.json"
    settings.write_text(settings.read_text().replace('"@evertondgn/solid-runtime":', '"absent":'))
    return dist / cli.name


# The files step ends in a synchronous part; this module holds the event loop there until the script creates the RELEASE file.
# With HOLD_AT=query it holds right after the CLI asked the system which process group owns the terminal. With HOLD_TURN it
# holds in the continuation of the next turn of the event loop the CLI waits for after that synchronous part.
HOLD_MODULE = """
import childProcess from 'node:child_process';
import fs, { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import callbacks from 'node:timers';
import timers from 'node:timers/promises';
let held = false;
const hold = () => {
  held = true;
  writeFileSync(process.env.HOLDING, '1');
  while (!existsSync(process.env.RELEASE)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
};
if (process.env.HOLD_AT === 'query') {
  const shouldHold = () => !held && existsSync(process.env.HOLD_QUERY);
  const spawn = childProcess.spawnSync;
  childProcess.spawnSync = (...args) => {
    const answer = spawn(...args);
    if (/(^|\\/)ps$/.test(String(args[0])) && shouldHold()) hold();
    return answer;
  };
  const read = fs.readFileSync;
  fs.readFileSync = (...args) => {
    const answer = read(...args);
    if (args[0] === '/proc/self/stat' && shouldHold()) hold();
    return answer;
  };
} else {
  let tick;
  let enqueueFrame = false;
  const trace = event => appendFileSync(process.env.HOLD_TURN, event + '\\n');
  if (process.env.HOLD_TURN) {
    const repeat = callbacks.setInterval;
    callbacks.setInterval = (callback, delay, ...args) => {
      if (callback.name !== 'tick' || (delay !== 80 && delay !== 120)) return repeat(callback, delay, ...args);
      tick = () => callback(...args);
      trace('interval');
      return undefined;
    };
    const immediate = callbacks.setImmediate;
    callbacks.setImmediate = (callback, ...args) => {
      if (!enqueueFrame) return immediate(callback, ...args);
      trace('queue B');
      return immediate((...values) => {
        trace('run B');
        callback(...values);
      }, ...args);
    };
  }
  const original = fs[process.env.HOLD_AT];
  let isTurnNext = false;
  fs[process.env.HOLD_AT] = (...args) => {
    if (!held && !isTurnNext && /\\.create-solid-[^/]+$/.test(String(args[0]))) {
      if (process.env.HOLD_TURN) isTurnNext = true;
      else hold();
    }
    return original(...args);
  };
  const turn = timers.setImmediate;
  timers.setImmediate = (...args) => {
    const next = turn(...args);
    if (!isTurnNext) return next;
    isTurnNext = false;
    trace('queue A');
    if (tick) {
      enqueueFrame = true;
      tick();
      enqueueFrame = false;
    }
    return next.then(value => {
      trace('run A');
      hold();
      return value;
    });
  };
}
syncBuiltinESMExports();
"""

# Once the script creates the INPUT_ERROR file, this emits an error on the input of the CLI with the code the file holds, as
# a change of mode of a closed terminal does. With INPUT_END the input ends first, and the next change of mode out of raw
# mode fails with that code.
INPUT_ERROR_MODULE = """
import { existsSync, readFileSync } from 'node:fs';
const input = process.stdin;
const setRawMode = input.setRawMode.bind(input);
const failure = code => Object.assign(new Error(`setRawMode ${code}`), { code, syscall: 'setRawMode' });
let ended;
input.setRawMode = flag => {
  if (ended === undefined || flag) return setRawMode(flag);
  input.emit('error', failure(ended));
  return input;
};
const timer = setInterval(() => {
  if (!existsSync(process.env.INPUT_ERROR)) return;
  // A file exists before its content is written.
  const code = readFileSync(process.env.INPUT_ERROR, 'utf8');
  if (!code) return;
  clearInterval(timer);
  if (process.env.INPUT_END) {
    ended = code;
    input.emit('end');
  } else input.emit('error', failure(code));
}, 10);
timer.unref();
"""

# Once the CLI has written to its standard output, this emits on that output the error of a write that failed with EIO, and
# every later write to it fails the same way, as on a disk that failed. With OUTPUT_ERROR it waits instead for the script to
# write a code in that file, and fails with that code.
OUTPUT_ERROR_MODULE = """
import { existsSync, readFileSync } from 'node:fs';
const output = process.stdout;
const failure = code => Object.assign(new Error(`write ${code}`), { code, syscall: 'write' });
const fail = code => {
  output._write = (chunk, encoding, callback) => callback(failure(code));
  output._writev = (chunks, callback) => callback(failure(code));
  output.emit('error', failure(code));
};
if (process.env.OUTPUT_ERROR) {
  const timer = setInterval(() => {
    if (!existsSync(process.env.OUTPUT_ERROR)) return;
    // A file exists before its content is written.
    const code = readFileSync(process.env.OUTPUT_ERROR, 'utf8');
    if (!code) return;
    clearInterval(timer);
    fail(code);
  }, 10);
  timer.unref();
} else {
  const write = output.write;
  let isFailed = false;
  output.write = function (...args) {
    if (!isFailed) {
      isFailed = true;
      setImmediate(() => fail('EIO'));
    }
    return Reflect.apply(write, this, args);
  };
}
"""

# Hold the waiting notice until the test releases it and label the timer registrations before the actual installer exit.
SIGNAL_ORDER_MODULE = """
import { ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
const record = (...event) => appendFileSync(process.env.SIGNAL_TRACE, JSON.stringify(event) + '\\n');
Object.defineProperty(performance, 'now', { value: () => Number(readFileSync(process.env.SIGNAL_CLOCK, 'utf8')) });
const interval = globalThis.setInterval;
globalThis.setInterval = (callback, delay, ...args) => {
  if (delay === 250) record('deadline armed', performance.now());
  return interval(callback, delay, ...args);
};
const timeout = globalThis.setTimeout;
globalThis.setTimeout = (callback, delay, ...args) => {
  if (delay !== 150) return timeout(callback, delay, ...args);
  record('notice armed');
  const timer = interval(() => {
    if (!existsSync(process.env.NOTICE_RELEASE)) return;
    clearInterval(timer);
    callback(...args);
  }, 10);
  return timer;
};
const kill = ChildProcess.prototype.kill;
ChildProcess.prototype.kill = function (signal) {
  record('child signal', this.pid, signal, performance.now());
  return kill.call(this, signal);
};
const emit = ChildProcess.prototype.emit;
ChildProcess.prototype.emit = function (event, ...args) {
  if (event === 'exit' && this.spawnfile === 'bun') record('installer exit', this.pid);
  return emit.call(this, event, ...args);
};
for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(name, () => {
    const at = performance.now();
    setImmediate(() => record('handled', name, at));
  });
}
process.stdout.on('error', error => setImmediate(() => record('output error', error.code)));
"""

# Record the destination of a cleanup notice and acknowledge its callback, including when there is nowhere to write.
NOTICE_OUTPUT_MODULE = """
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
const outputs = { stdout: process.stdout, stderr: process.stderr };
const record = (...values) => appendFileSync(process.env.NOTICE_TRACE, JSON.stringify(values) + '\\n');
for (const [name, output] of Object.entries(outputs)) {
  const write = output.write;
  output.write = function (chunk, ...args) {
    if (String(chunk).includes('Waiting for Bun to clean up.')) record('notice', name);
    return Reflect.apply(write, this, [chunk, ...args]);
  };
}
const timeout = globalThis.setTimeout;
globalThis.setTimeout = (callback, delay, ...args) => {
  if (delay !== 150) return timeout(callback, delay, ...args);
  return timeout(() => {
    callback(...args);
    writeFileSync(process.env.NOTICE_DONE, '1');
  }, delay);
};
const timer = setInterval(() => {
  if (!existsSync(process.env.NOTICE_ERRORS)) return;
  const events = readFileSync(process.env.NOTICE_ERRORS, 'utf8');
  if (!events) return;
  clearInterval(timer);
  for (const [name, code] of JSON.parse(events)) {
    record('failure', name, code);
    outputs[name].emit('error', Object.assign(new Error(code), { code }));
  }
}, 10);
timer.unref();
"""

# Inject errors only once the selected screen has started writing. The side trace works even when both outputs are lost.
OUTPUT_ORDER_MODULE = """
import { appendFileSync } from 'node:fs';
const outputs = { stdout: process.stdout, stderr: process.stderr };
const events = JSON.parse(process.env.OUTPUT_EVENTS);
const record = (...values) => appendFileSync(process.env.OUTPUT_TRACE, JSON.stringify(values) + '\\n');
const fail = ([name, code, isTTY], when) => {
  const stream = outputs[name];
  if (isTTY && !stream.isTTY) Object.defineProperty(stream, 'isTTY', { value: true });
  record(when, name, code);
  stream.emit('error', Object.assign(new Error(code), { code }));
};
let started = false;
let failing = false;
for (const [name, stream] of Object.entries(outputs)) {
  const original = stream.write;
  stream.write = function (chunk, ...args) {
    const text = String(chunk);
    const marker = process.env.OUTPUT_MARK;
    const trigger = process.env.OUTPUT_TRIGGER_STREAM || 'stdout';
    if (name === trigger && !started && (!marker || text.includes(marker))) {
      started = true;
      const accepted = Reflect.apply(original, this, [chunk, ...args]);
      record('display accepted', accepted);
      setImmediate(() => {
        failing = true;
        for (const event of events) fail(event, 'observed');
      });
      return accepted;
    }
    if (text.startsWith('Could not write to the standard ')) {
      record('report attempt', name, text);
      if (process.env.REPORT_FAILURE) {
        fail([name, process.env.REPORT_FAILURE, false], 'reported during write');
        return false;
      }
    } else if (failing && marker) record('closing write', name, text);
    return Reflect.apply(original, this, [chunk, ...args]);
  };
}
process.on('exit', code => record('exit', code));
"""

# This records in WRITE_RECORD each write to the standard output and error of the CLI, with the output, whether the chunk is
# bytes, as the forward of the installer writes, or text, as the CLI writes, its size, what the write returned and the bytes
# then waiting in that output, and each error these outputs emit, with its code. With PENDING it creates that file at the
# first write of bytes that leaves bytes waiting.
WRITE_RECORD_MODULE = """
import { appendFileSync, writeFileSync } from 'node:fs';
for (const [name, output] of [['stdout', process.stdout], ['stderr', process.stderr]]) {
  const write = output.write;
  output.write = function (chunk, ...args) {
    const returned = Reflect.apply(write, this, [chunk, ...args]);
    const kind = typeof chunk === 'string' ? 'text' : 'bytes';
    appendFileSync(process.env.WRITE_RECORD, `write ${name} ${kind} ${chunk.length} ${returned} ${output.writableLength}\\n`);
    if (process.env.PENDING && kind === 'bytes' && output.writableLength > 0) writeFileSync(process.env.PENDING, '1');
    return returned;
  };
  const emit = output.emit;
  output.emit = function (event, ...args) {
    if (event === 'error') appendFileSync(process.env.WRITE_RECORD, `error ${name} ${args[0]?.code}\\n`);
    return Reflect.apply(emit, this, [event, ...args]);
  };
}
"""

# From a timer, this holds the event loop once the script creates the HOLD file, until it creates the RELEASE file.
TIMER_HOLD_MODULE = """
import { existsSync, writeFileSync } from 'node:fs';
const timer = setInterval(() => {
  if (!existsSync(process.env.HOLD)) return;
  clearInterval(timer);
  writeFileSync(process.env.HOLDING, '1');
  while (!existsSync(process.env.RELEASE)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
}, 10);
timer.unref();
"""


class Pane:
    """A tmux window of 80 columns with scroll-on-clear on, where an interactive bash runs the CLI as a job and continues it
    with fg once the test creates the file go."""

    def __init__(self, case, root, command, rows):
        self.case = case
        self.rows = rows
        self.socket = str(root / "tmux.sock")
        self.go = root / "go"
        # SHELL keeps the login shell of the account, and the PATH it sets, out of the commands of tmux.
        self.env = {key: os.environ[key] for key in ("HOME", "PATH", "LANG", "TMPDIR") if key in os.environ} | {"SHELL": "/bin/sh"}
        script = f"{command}; until [ -e {shlex.quote(str(self.go))} ]; do sleep .05; done; fg"
        self.tmux("new-session", "-d", "-x", "80", "-y", str(rows), "-c", str(root), "/bin/sh")
        self.tmux("set-option", "remain-on-exit", "on")
        self.tmux("set-option", "-g", "scroll-on-clear", "on")
        self.tmux("respawn-pane", "-k", "-c", str(root), "exec " + shlex.join([bash_path(), "--norc", "--noprofile", "-i", "-c", script]))

    def tmux(self, *args):
        return subprocess.check_output(["tmux", "-f", "/dev/null", "-S", self.socket, *args], env=self.env, text=True, timeout=5)

    def capture(self, history=False):
        return self.tmux("capture-pane", "-p", *(["-S", "-200"] if history else [])).rstrip("\n").split("\n")

    def split(self):
        """The history and the screen, with the trailing blank rows of the screen left out."""
        lines = self.tmux("capture-pane", "-p", "-S", "-200").split("\n")[:-1]
        return lines[:-self.rows], lines[-self.rows:]

    def wait_for(self, check, history=False):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            lines = self.capture(history)
            if check(lines):
                return lines
            time.sleep(.04)
        tty = self.tmux("display", "-p", "#{pane_tty}").strip().removeprefix("/dev/")
        table = subprocess.run(["ps", "-o", "pid,ppid,pgid,tpgid,stat,args", "-t", tty], capture_output=True, text=True).stdout
        self.case.fail(f"{self.capture(history)}\n{table}")

    def job(self):
        [worker] = children(int(self.tmux("display", "-p", "#{pane_pid}")))
        return worker

    def wait_stopped(self, worker):
        deadline = time.monotonic() + 10
        while "T" not in state(worker):
            self.case.assertLess(time.monotonic(), deadline, self.capture(True))
            time.sleep(.04)

    def close(self):
        self.tmux("kill-server")


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

    def mark(self, slave):
        """Read all the CLI wrote before it stopped, up to a mark written through the slave, and return where the mark starts."""
        start = len(self.transcript)
        os.write(slave, MARK)
        self.until(MARK, start)
        return self.transcript.index(MARK, start)


def recorded(file):
    """Read the number in a file once it has content: a file exists before its content is written."""
    deadline = time.monotonic() + 10
    while True:
        text = file.read_text().strip() if file.exists() else ""
        if text or time.monotonic() >= deadline:
            return int(text) if text else None
        time.sleep(.01)


def question_session(directory, language, prompts, before_answer=None, color=False, columns=80, piped=False, ask_directory=False, name="app", errors=None, preload=None, environment=None, flags=None):
    """With errors, stderr goes to that file instead of the terminal. Node imports the preload module before the CLI.
    flags replace the Git and install flags."""
    master, slave = pty.openpty()
    error_file = open(errors, "wb") if errors else None
    try:
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, columns, 0, 0))
        with subprocess.Popen([node, *(["--import", pathlib.Path(preload).as_uri()] if preload else []), cli, *([] if ask_directory else [name]), "--lang", language, "--mode", "server",
                               *(flags or ["--no-git", "--install" if piped else "--no-install"])], cwd=directory,
                              env={**os.environ, "PATH": directory + os.pathsep + os.environ["PATH"] if piped else os.environ["PATH"], "CI": "false",
                                   "NO_COLOR": "" if color else "1", "FORCE_COLOR": "1" if color else "0", "TERM": "xterm", **(environment or {})},
                              stdin=slave, stdout=subprocess.PIPE if piped else slave, stderr=error_file or slave) as child:
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
        if error_file:
            error_file.close()


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
                        # A different signal is a second one from the person and forces at once, even inside the window of a
                        # repeated signal. A SIGHUP never forces.
                        time.sleep(.08)
                        os.kill(pid, signal.SIGINT)
                    if install and not second:
                        # The installer ignores SIGINT, so the CLI forces it only at the long bound.
                        deadline = started + CLEANUP_LIMIT_S + 4
                    if descendant and second:
                        deadline = started + .65

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
                        ended = time.monotonic()
                        break
                    time.sleep(.01)
                self.assertTrue(waited)
                if interrupt and install and not second:
                    self.assertGreaterEqual(ended - started, CLEANUP_LIMIT_S)
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
                    # Only Ctrl+C is echoed by the terminal, and its echo stays alone on its line. The CLI cannot tell a SIGINT
                    # sent with kill from Ctrl+C, so it ends the line of an echo that never came.
                    echo = ([""] if second else []) if interrupt else ["^C"]
                    # An installer that ignores SIGINT is still running when the window of a repeated signal closes.
                    waiting = [WAITING_LINE] if interrupt and not second else []
                    closing = [*echo, *waiting, "■ Installing dependencies with Bun", "Your project is in parent/app. To finish, run:",
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
        # Ctrl+C during the install: the indicator draws only on a terminal, so the waiting line goes to the standard
        # error, here the terminal, after the ^C the terminal echoes.
        with self.subTest(canceled="during the install"), tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / "installer.js").write_text(CLEANING_INSTALLER)
            installer = root / "bun"
            installer.write_text(f"#!/bin/sh\nexec {shlex.quote(node)} {shlex.quote(str(root / 'installer.js'))}\n")
            installer.chmod(0o755)
            cleaned = root / "cleaned"
            reader, writer = os.pipe()
            pid, master, slave = start_cli(
                root, ["app", "--lang", "en", "--mode", "server", "--no-git", "--install"],
                {"PID_FILE": str(root / "installer.pid"), "PATH": directory + ":" + os.environ["PATH"],
                 "CLEANING": str(root / "cleaning"), "CLEANED": str(cleaned), "FINISH": str(root / "finish"),
                 "CLEANUP_MS": "1500"}, stdout=writer)
            os.close(writer)
            terminal, piped = Reader(self, master), Reader(self, reader)
            waited = False
            try:
                for prompt in [b"Application title", b"Setup", b"Create the project?"]:
                    piped.until(prompt)
                    os.write(master, b"\r")
                piped.until(b"Files created")
                self.assertIsNotNone(recorded(root / "installer.pid"))
                start = len(terminal.transcript)
                os.write(master, b"\x03")
                terminal.until(WAITING_LINE.encode(), start)
                piped.until(b"Creation canceled.")
                deadline = time.monotonic() + 5
                while time.monotonic() < deadline:
                    terminal.drain()
                    finished, status = os.waitpid(pid, os.WNOHANG)
                    if finished:
                        waited = True
                        break
                    time.sleep(.01)
                self.assertTrue(waited)
                terminal.drain()
                self.assertEqual(os.waitstatus_to_exitcode(status), 130)
                self.assertTrue(cleaned.exists())
                self.assertEqual(terminal.transcript[start:].decode().splitlines(), ["^C", WAITING_LINE])
            finally:
                (root / "finish").touch()
                os.close(master)
                os.close(slave)
                os.close(reader)
                if not waited:
                    os.kill(pid, signal.SIGKILL)
                    os.waitpid(pid, 0)
                target = recorded(root / "installer.pid") if (root / "installer.pid").exists() else None
                try:
                    if target and os.getsid(target) == pid:
                        os.kill(target, signal.SIGKILL)
                except ProcessLookupError:
                    pass

    def test_step_job_signals(self):
        # Without a key the script stops the CLI itself, as an outside SIGSTOP would.
        self.step_job_signals([(b"\x1a", False), (b"\x1a", True), (None, False)])

    def test_step_quit_key(self):
        # Ctrl+\ has a test of its own, so that the cases above can run again on macOS, where each process SIGQUIT ends
        # leaves a crash report.
        self.step_job_signals([(b"\x1c", False)])

    def step_job_signals(self, cases):
        for key, job_control in cases:
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
                    """Stop the CLI from outside and return where what it writes after the stop starts."""
                    os.kill(leader, signal.SIGSTOP)
                    deadline = time.monotonic() + 4
                    while "T" not in state(leader):
                        self.assertLess(time.monotonic(), deadline)
                        time.sleep(.01)
                    stopped = reader.mark(slave) + len(MARK)
                    self.assertEqual(reader.cursor(), hidden)
                    return stopped
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
                    continued = outside = stopped = None
                    if key:
                        os.write(master, key)
                        read_until(shown, start)
                        assert_cleared(start)
                    else:
                        stopped = stop_outside()
                    if key != b"\x1c":
                        if job_control:
                            self.assertEqual(recorded(root / "stop.signal"), signal.SIGTSTP)
                            self.assertIn("T", state(leader))
                            self.assertIn("T", state(worker))
                            stopped = reader.mark(slave) + len(MARK)
                            self.assertEqual(reader.cursor(), shown)
                        if job_control or not key:
                            continued = stopped
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
                            outside = stop_outside()
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
                    [worker] = children(leader)
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
                        reader.mark(slave)
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
                        # The CLI read the key, so it erases the question before the stop even when a launcher shares its group.
                        self.assertRegex(bytes(transcript[start:transcript.index(shown, start)]), rb"\A\x1b\[\d+A\x1b\[2K\x1b\[B\r\x1b\[J\x1b\[A\Z")
                        self.assertEqual(recorded(root / "stop.signal"), signal.SIGTSTP)
                        members = [leader]
                        if launcher:
                            members.extend(children(leader))
                            self.assertEqual(len(members), 2)
                        for member in members:
                            self.assertIn("T", state(member))
                        reader.mark(slave)
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
                        outside = reader.mark(slave) + len(MARK)
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
                                os.killpg(os.getpgid(target), signal.SIGKILL)
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
                        reader.mark(slave)
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
        # With held, the CLI gets its answer about the terminal while the launcher still runs, and the shell takes the
        # terminal and writes its prompt before the CLI goes on. With alone, the stop is sent only to the CLI, which then
        # stops its group so the shell sees it.
        cases = [(stage, held, False) for stage, held in itertools.product(
            (b"Application title", b"Installing dependencies with Bun"), (False, True))]
        for stage, held, alone in [*cases, (b"Installing dependencies with Bun", False, True)]:
            with self.subTest(stage=stage, held=held, alone=alone), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                installer = root / "bun"
                installer.write_text('#!/bin/sh\necho $$ > "$PID_FILE"\nsleep 20\n')
                installer.chmod(0o755)
                release = root / "release"
                hold = {"HOLDING": str(root / "holding"), "RELEASE": str(release)}
                if held:
                    hold.update(NODE_OPTIONS="--import=data:text/javascript," + quote(HOLD_MODULE),
                                HOLD_AT="query", HOLD_QUERY=str(root / "hold-query"))
                elif stage != b"Application title":
                    # The indicator draws until the CLI reads its signal, so the loop is held while the two signals are sent.
                    hold.update(NODE_OPTIONS="--import=data:text/javascript," + quote(TIMER_HOLD_MODULE), HOLD=str(root / "hold"))
                pid, master, slave = start_cli(
                    root, ["app", "--lang", "en", "--mode", "server", "--no-git", "--install"],
                    {"PID_FILE": str(root / "installer.pid"), "PATH": directory + ":" + os.environ["PATH"], **hold},
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
                    [worker] = children(launcher)
                    if held:
                        (root / "hold-query").touch()
                        os.kill(worker, signal.SIGTSTP)
                        self.assertEqual(recorded(root / "holding"), 1)
                    elif stage != b"Application title":
                        (root / "hold").touch()
                        self.assertEqual(recorded(root / "holding"), 1)
                    if not alone:
                        os.kill(launcher, signal.SIGSTOP)
                        # The parent has taken the terminal back when it records the stop.
                        self.assertEqual(recorded(root / "stop.signal"), signal.SIGSTOP)
                    reader.mark(slave)
                    if held:
                        os.write(slave, b"[1]+  Stopped\r\n$ ")
                        reader.until(b"$ ")
                        start = len(transcript)
                        release.touch()
                    else:
                        start = len(transcript)
                        os.kill(worker, signal.SIGTSTP)
                        release.touch()
                    deadline = time.monotonic() + 4
                    while "T" not in state(worker):
                        self.assertLess(time.monotonic(), deadline)
                        time.sleep(.01)
                    if alone:
                        self.assertEqual(recorded(root / "stop.signal"), signal.SIGTSTP)
                        self.assertIn("T", state(launcher))
                    marked = reader.mark(slave)
                    # The shell owns the terminal: the CLI shows the cursor and erases nothing.
                    self.assertEqual(bytes(transcript[start:marked]), shown)
                    self.assertTrue(cooked())
                    os.write(slave, b"fg\r\n" if held else b"[1]+  Stopped\r\n$ fg\r\n")
                    reader.until(b"fg", start)
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
                        reader.until(stage, continued)
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

    def test_ctrl_c_under_a_launcher(self):
        # Ctrl+C during a step under a launcher that waits for the CLI, as bash does, and under one that dies at once, as
        # dash does. Only what the CLI does is checked: its closing line, its exit code and the cursor shown last.
        for launcher in (True, "dies"):
            with self.subTest(launcher=launcher), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                installer = root / "bun"
                installer.write_text('#!/bin/sh\necho $$ > "$PID_FILE"\nsleep 20\n')
                installer.chmod(0o755)
                entry = root / "entry.mjs"
                entry.write_text(EXIT_ENTRY)
                pid, master, slave = start_cli(
                    root, ["app", "--lang", "en", "--mode", "server", "--no-git", "--install"],
                    {"PID_FILE": str(root / "installer.pid"), "PATH": directory + ":" + os.environ["PATH"],
                     "EXIT_FILE": str(root / "cli.exit"), "CLI_URL": cli.as_uri()},
                    job_control=True, launcher=launcher, shell=True, stay=True, executable=entry)
                reader = Reader(self, master)
                transcript = reader.transcript
                waited = False
                try:
                    for prompt in [b"Application title", b"Setup", b"Create the project?"]:
                        reader.until(prompt)
                        os.write(master, b"\r")
                    reader.until(b"Installing dependencies with Bun")
                    self.assertIsNotNone(recorded(root / "installer.pid"))
                    start = len(transcript)
                    os.write(master, b"\x03")
                    reader.until("└  Creation canceled.".encode(), start)
                    self.assertEqual(recorded(root / "cli.exit"), 130)
                    deadline = time.monotonic() + 5
                    while time.monotonic() < deadline:
                        reader.drain()
                        finished, status = os.waitpid(pid, os.WNOHANG)
                        if finished:
                            waited = True
                            break
                        time.sleep(.01)
                    self.assertTrue(waited)
                    reader.drain()
                    self.assertEqual(reader.cursor(), b"\x1b[?25h")
                    # bash waits and ends with the code of the CLI; the other launcher died of the SIGINT.
                    self.assertEqual(recorded(root / "launcher.ended"), 130 if launcher is True else -signal.SIGINT)
                finally:
                    for file in (root / "installer.pid", root / "cli.pid"):
                        target = recorded(file) if file.exists() else None
                        try:
                            if target and os.getsid(target) == pid:
                                os.killpg(os.getpgid(target), signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                    os.close(master)
                    os.close(slave)
                    if not waited:
                        os.kill(pid, signal.SIGKILL)
                        os.waitpid(pid, 0)

    def test_signal_forwarded_by_a_launcher(self):
        # Under a launcher that forwards signals as npm does, Ctrl+C or a SIGTERM sent to the group reaches the CLI twice at
        # once, and the installer must still end its cleanup. Two signals 300 ms apart are a person who wants out at once.
        for interrupt, together in itertools.product((signal.SIGINT, signal.SIGTERM), (True, False)):
            with self.subTest(signal=interrupt, together=together), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                (root / "installer.js").write_text(CLEANING_INSTALLER)
                installer = root / "bun"
                installer.write_text(f"#!/bin/sh\nexec {shlex.quote(node)} {shlex.quote(str(root / 'installer.js'))}\n")
                installer.chmod(0o755)
                entry = root / "entry.mjs"
                entry.write_text(EXIT_ENTRY)
                cleaning, finish, cleaned = root / "cleaning", root / "finish", root / "cleaned"
                pid, master, slave = start_cli(
                    root, ["app", "--lang", "en", "--mode", "server", "--no-git", "--install"],
                    {"PID_FILE": str(root / "installer.pid"), "PATH": directory + ":" + os.environ["PATH"],
                     "EXIT_FILE": str(root / "cli.exit"), "CLI_URL": cli.as_uri(),
                     "CLEANING": str(cleaning), "FINISH": str(finish), "CLEANED": str(cleaned)},
                    job_control=True, launcher="forwards", shell=True, stay=True, executable=entry)
                reader = Reader(self, master)
                transcript = reader.transcript
                waited = False
                try:
                    for prompt in [b"Application title", b"Setup", b"Create the project?"]:
                        reader.until(prompt)
                        os.write(master, b"\r")
                    reader.until(b"Installing dependencies with Bun")
                    worker = recorded(root / "installer.pid")
                    self.assertIsNotNone(worker)
                    launcher = recorded(root / "cli.pid")
                    [command] = children(launcher)
                    start = len(transcript)
                    sent = time.monotonic()
                    if together:
                        # The launcher, the CLI and the installer get the signal, and the launcher sends the CLI one more.
                        if interrupt == signal.SIGINT:
                            os.write(master, b"\x03")
                        else:
                            os.killpg(launcher, signal.SIGTERM)
                        deadline = time.monotonic() + 4
                        while not cleaning.exists() and b"Creation canceled." not in transcript[start:]:
                            self.assertLess(time.monotonic(), deadline)
                            reader.drain()
                            time.sleep(.01)
                        finish.touch()
                    else:
                        os.kill(command, interrupt)
                        # The installer starts its cleanup on the SIGINT the CLI sends it, so by then the CLI has handled the first signal.
                        deadline = time.monotonic() + 4
                        while not cleaning.exists():
                            self.assertLess(time.monotonic(), deadline)
                            time.sleep(.005)
                        time.sleep(.3)
                        sent = time.monotonic()
                        os.kill(command, interrupt)
                    reader.until("└  Creation canceled.".encode(), start)
                    elapsed = time.monotonic() - sent
                    self.assertEqual(recorded(root / "cli.exit"), 130)
                    deadline = time.monotonic() + 5
                    while time.monotonic() < deadline:
                        reader.drain()
                        finished, status = os.waitpid(pid, os.WNOHANG)
                        if finished:
                            waited = True
                            break
                        time.sleep(.01)
                    self.assertTrue(waited)
                    self.assertEqual(recorded(root / "launcher.ended"), 130)
                    if together:
                        self.assertTrue(cleaned.exists())
                    else:
                        self.assertFalse(cleaned.exists())
                        with self.assertRaises(ProcessLookupError):
                            os.kill(worker, 0)
                        # A second signal taken for the first would leave the force to the long bound, CLEANUP_LIMIT_S after the first one.
                        self.assertLess(elapsed, .3)
                finally:
                    finish.touch()
                    for file in (root / "installer.pid", root / "cli.pid"):
                        target = recorded(file) if file.exists() else None
                        try:
                            if target and os.getsid(target) == pid:
                                os.killpg(os.getpgid(target), signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                    os.close(master)
                    os.close(slave)
                    if not waited:
                        os.kill(pid, signal.SIGKILL)
                        os.waitpid(pid, 0)

    def test_cleanup_after_ctrl_c(self):
        # Ctrl+C reaches the installer from the terminal and from the CLI, and the CLI waits for its cleanup of about 1.5 s.
        # A second Ctrl+C after the window of a repeated signal forces it at once. The waiting line comes once that window
        # closes, in the frame of the step or, in plain output, on a line of its own after the echo of each ^C.
        for plain, second in itertools.product((False, True), (False, True)):
            with self.subTest(plain=plain, second=second), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                (root / "installer.js").write_text(CLEANING_INSTALLER)
                installer = root / "bun"
                installer.write_text(f"#!/bin/sh\nexec {shlex.quote(node)} {shlex.quote(str(root / 'installer.js'))}\n")
                installer.chmod(0o755)
                cleaning, cleaned = root / "cleaning", root / "cleaned"
                pid, master, slave = start_cli(
                    root, ["parent/app", "--lang", "en", "--mode", "server", "--no-git", "--install", *(["--yes"] if plain else [])],
                    {"PID_FILE": str(root / "installer.pid"), "PATH": directory + ":" + os.environ["PATH"],
                     "CLEANING": str(cleaning), "CLEANED": str(cleaned), "FINISH": str(root / "finish"),
                     **({} if second else {"CLEANUP_MS": "1500"})})
                reader = Reader(self, master)
                transcript = reader.transcript
                waited = False
                try:
                    for prompt in [] if plain else [b"Application title", b"Setup", b"Create the project?"]:
                        reader.until(prompt)
                        os.write(master, b"\r")
                    reader.until(b"Files created" if plain else b"Installing dependencies with Bun")
                    worker = recorded(root / "installer.pid")
                    self.assertIsNotNone(worker)
                    start = len(transcript)
                    sent = time.monotonic()
                    os.write(master, b"\x03")
                    reader.until(WAITING_LINE.encode(), start)
                    if second:
                        time.sleep(max(0, sent + 1 - time.monotonic()))
                        sent = time.monotonic()
                        os.write(master, b"\x03")
                    reader.until(b"Creation canceled.", start)
                    deadline = time.monotonic() + 5
                    while time.monotonic() < deadline:
                        reader.drain()
                        finished, status = os.waitpid(pid, os.WNOHANG)
                        if finished:
                            waited = True
                            elapsed = time.monotonic() - sent
                            break
                        time.sleep(.01)
                    self.assertTrue(waited)
                    reader.drain()
                    self.assertEqual(os.waitstatus_to_exitcode(status), 130)
                    with self.assertRaises(ProcessLookupError):
                        os.kill(worker, 0)
                    if second:
                        self.assertFalse(cleaned.exists())
                        self.assertLess(elapsed, 1)
                    else:
                        self.assertTrue(cleaned.exists())
                        self.assertGreaterEqual(elapsed, 1.5)
                    echo = ["^C"] * (1 + int(second))
                    closing = ["■ Installing dependencies with Bun" if plain else "■  Installing dependencies with Bun"]
                    if plain:
                        lines = transcript.decode().rstrip().splitlines()
                        expected = ["◇ Files created", echo[0], WAITING_LINE, *echo[1:], *closing,
                                    "Your project is in parent/app. To finish, run:", "cd parent/app", "bun install", "",
                                    "Creation canceled."]
                        self.assertEqual(lines[-len(expected):], expected)
                    else:
                        lines = install_screen(transcript, 80)
                        while lines and not lines[-1]:
                            lines.pop()
                        self.assertEqual(lines[-6:], [*closing, "│  Your project is in parent/app. To finish, run:",
                                                      "│  cd parent/app", "│  bun install", "│", "└  Creation canceled."])
                        self.assertFalse([line for line in lines if WAITING_LINE in line], lines)
                        self.assertEqual(reader.cursor(), b"\x1b[?25h")
                finally:
                    (root / "finish").touch()
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

    def test_hangup_during_cleanup(self):
        # A SIGHUP never forces the installer, whether it comes after Ctrl+C, after a SIGTERM or after another SIGHUP, as when
        # the person closes the terminal while the CLI waits. The installer ends its cleanup of about 1.5 s.
        for first in (b"\x03", signal.SIGTERM, signal.SIGHUP):
            with self.subTest(first=first), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                (root / "installer.js").write_text(CLEANING_INSTALLER)
                installer = root / "bun"
                installer.write_text(f"#!/bin/sh\nexec {shlex.quote(node)} {shlex.quote(str(root / 'installer.js'))}\n")
                installer.chmod(0o755)
                cleaned = root / "cleaned"
                pid, master, slave = start_cli(
                    root, ["app", "--lang", "en", "--mode", "server", "--no-git", "--install"],
                    {"PID_FILE": str(root / "installer.pid"), "PATH": directory + ":" + os.environ["PATH"],
                     "CLEANING": str(root / "cleaning"), "CLEANED": str(cleaned), "FINISH": str(root / "finish"),
                     "CLEANUP_MS": "1500"})
                reader = Reader(self, master)
                transcript = reader.transcript
                waited = False
                try:
                    for prompt in [b"Application title", b"Setup", b"Create the project?"]:
                        reader.until(prompt)
                        os.write(master, b"\r")
                    reader.until(b"Installing dependencies with Bun")
                    worker = recorded(root / "installer.pid")
                    self.assertIsNotNone(worker)
                    start = len(transcript)
                    sent = time.monotonic()
                    if isinstance(first, bytes):
                        os.write(master, first)
                    else:
                        os.kill(pid, first)
                    # The waiting line comes once the window of a repeated signal has closed, so the SIGHUP is no repeat. It
                    # never says again.
                    reader.until(WAITING_LINE.encode(), start)
                    self.assertNotIn(b"again", transcript[start:])
                    os.kill(pid, signal.SIGHUP)
                    reader.until(b"Creation canceled.", start)
                    deadline = time.monotonic() + 5
                    while time.monotonic() < deadline:
                        reader.drain()
                        finished, status = os.waitpid(pid, os.WNOHANG)
                        if finished:
                            waited = True
                            elapsed = time.monotonic() - sent
                            break
                        time.sleep(.01)
                    self.assertTrue(waited)
                    self.assertEqual(os.waitstatus_to_exitcode(status), 130)
                    self.assertTrue(cleaned.exists(), install_screen(transcript, 80))
                    self.assertGreaterEqual(elapsed, 1.5)
                finally:
                    (root / "finish").touch()
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

    def test_stop_during_cleanup(self):
        # The long bound counts only the time the CLI ran. A stop of its whole group during the cleanup, longer than the
        # bound, leaves the installer to end its cleanup once the group goes on.
        for plain in (False, True):
            with self.subTest(plain=plain), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                (root / "installer.js").write_text(CLEANING_INSTALLER)
                installer = root / "bun"
                installer.write_text(f"#!/bin/sh\nexec {shlex.quote(node)} {shlex.quote(str(root / 'installer.js'))}\n")
                installer.chmod(0o755)
                cleaning, cleaned, finish = root / "cleaning", root / "cleaned", root / "finish"
                pid, master, slave = start_cli(
                    root, ["app", "--lang", "en", "--mode", "server", "--no-git", "--install", *(["--yes"] if plain else [])],
                    {"PID_FILE": str(root / "installer.pid"), "PATH": directory + ":" + os.environ["PATH"],
                     "CLEANING": str(cleaning), "CLEANED": str(cleaned), "FINISH": str(finish)})
                reader = Reader(self, master)
                transcript = reader.transcript
                waited = False
                try:
                    for prompt in [] if plain else [b"Application title", b"Setup", b"Create the project?"]:
                        reader.until(prompt)
                        os.write(master, b"\r")
                    reader.until(b"Files created" if plain else b"Installing dependencies with Bun")
                    worker = recorded(root / "installer.pid")
                    self.assertIsNotNone(worker)
                    start = len(transcript)
                    os.write(master, b"\x03")
                    reader.until(WAITING_LINE.encode(), start)
                    self.assertTrue(cleaning.exists())
                    os.killpg(pid, signal.SIGSTOP)
                    deadline = time.monotonic() + 4
                    while not ("T" in state(pid) and "T" in state(worker)):
                        self.assertLess(time.monotonic(), deadline)
                        time.sleep(.01)
                    time.sleep(CLEANUP_LIMIT_S + 1)
                    os.killpg(pid, signal.SIGCONT)
                    # A bound that counted the stop would force the installer as soon as the CLI runs again.
                    time.sleep(1)
                    finish.touch()
                    reader.until(b"Creation canceled.", start)
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
                    self.assertTrue(cleaned.exists(), transcript[start:])
                finally:
                    finish.touch()
                    os.close(master)
                    os.close(slave)
                    if not waited:
                        os.killpg(pid, signal.SIGCONT)
                        os.kill(pid, signal.SIGKILL)
                        os.waitpid(pid, 0)
                    target = recorded(root / "installer.pid") if (root / "installer.pid").exists() else None
                    try:
                        if target and os.getsid(target) == pid:
                            os.kill(target, signal.SIGKILL)
                    except ProcessLookupError:
                        pass

    def test_installer_outliving_its_kill(self):
        # An installer in a wait that nothing interrupts outlives the SIGKILL that a second Ctrl+C sends. The CLI lets it go a
        # short time later and ends as a cancel, and the Ctrl+C that come after it force nothing more.
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            installer = root / "bun"
            installer.write_text('#!/bin/sh\ntrap "" INT HUP TERM\necho $$ > "$PID_FILE"\nwhile :; do sleep .05; done\n')
            installer.chmod(0o755)
            entry, children_file = root / "entry.mjs", root / "children"
            entry.write_text(EXIT_ENTRY)
            pid, master, slave = start_cli(
                root, ["app", "--lang", "en", "--mode", "server", "--no-git", "--install"],
                {"PID_FILE": str(root / "installer.pid"), "PATH": directory + ":" + os.environ["PATH"],
                 "EXIT_FILE": str(root / "cli.exit"), "CLI_URL": cli.as_uri(), "CLI_CHILDREN": str(children_file),
                 "CLI_UNKILLABLE": "1"}, executable=entry)
            reader = Reader(self, master)
            transcript = reader.transcript
            waited = False
            try:
                for prompt in [b"Application title", b"Setup", b"Create the project?"]:
                    reader.until(prompt)
                    os.write(master, b"\r")
                reader.until(b"Installing dependencies with Bun")
                worker = recorded(root / "installer.pid")
                self.assertIsNotNone(worker)
                start = len(transcript)
                os.write(master, b"\x03")
                reader.until(WAITING_LINE.encode(), start)
                forced = time.monotonic()
                # More than the 10 listeners after which Node warns that one leaks.
                for _ in range(12):
                    os.write(master, b"\x03")
                    time.sleep(.02)
                deadline = time.monotonic() + KILL_WAIT_S + 4
                while time.monotonic() < deadline:
                    reader.drain()
                    finished, status = os.waitpid(pid, os.WNOHANG)
                    if finished:
                        waited = True
                        break
                    time.sleep(.01)
                self.assertTrue(waited, install_screen(transcript, 80))
                reader.drain()
                self.assertEqual(os.waitstatus_to_exitcode(status), 130)
                self.assertGreaterEqual(time.monotonic() - forced, KILL_WAIT_S)
                self.assertIn(b"Creation canceled.", transcript[start:])
                self.assertNotIn(b"MaxListenersExceededWarning", transcript)
                kills = [line.split()[1] for line in children_file.read_text().splitlines() if line.startswith("kill ")]
                self.assertEqual(kills, ["SIGINT", "SIGKILL"])
                os.kill(worker, 0)
            finally:
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

    def test_installer_ends_while_a_descendant_holds_stderr(self):
        # A lifecycle script that outlives bun keeps the stderr pipe of bun. Once bun has exited, on its own or on the SIGINT
        # the CLI sends it after a SIGTERM to the CLI, the CLI waits for that pipe only a short time after the exit.
        for interrupt in (None, signal.SIGTERM):
            with self.subTest(signal=interrupt), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                installer = root / "bun"
                ending = "trap 'exit 130' INT\nwhile :; do sleep .05; done" if interrupt else "exit 0"
                installer.write_text(f'#!/bin/sh\nsleep 30 &\necho $! > "$GRANDCHILD"\necho $$ > "$PID_FILE"\n{ending}\n')
                installer.chmod(0o755)
                entry, children_file = root / "entry.mjs", root / "children"
                entry.write_text(EXIT_ENTRY)
                pid, master, slave = start_cli(
                    root, ["app", "--lang", "en", "--mode", "server", "--no-git", "--install"],
                    {"PID_FILE": str(root / "installer.pid"), "GRANDCHILD": str(root / "grandchild.pid"),
                     "PATH": directory + ":" + os.environ["PATH"], "EXIT_FILE": str(root / "cli.exit"),
                     "CLI_URL": cli.as_uri(), "CLI_CHILDREN": str(children_file)}, executable=entry)
                reader = Reader(self, master)
                waited = False
                try:
                    for prompt in [b"Application title", b"Setup", b"Create the project?"]:
                        reader.until(prompt)
                        os.write(master, b"\r")
                    reader.until(b"Installing dependencies with Bun")
                    self.assertIsNotNone(recorded(root / "installer.pid"))
                    self.assertIsNotNone(recorded(root / "grandchild.pid"))
                    if interrupt:
                        os.kill(pid, interrupt)
                    deadline = time.monotonic() + CLEANUP_LIMIT_S / 2
                    while time.monotonic() < deadline:
                        reader.drain()
                        finished, status = os.waitpid(pid, os.WNOHANG)
                        if finished:
                            waited = True
                            ended = time.time()
                            break
                        time.sleep(.01)
                    self.assertTrue(waited, reader.transcript)
                    # The record ends with the time of the exit, in milliseconds since the epoch.
                    [exited] = [float(line.split()[-1]) / 1000 for line in children_file.read_text().splitlines() if line.startswith("exit ")]
                    self.assertLess(ended - exited, PIPE_DRAIN_S + 1)
                    reader.drain()
                    if interrupt:
                        self.assertEqual(os.waitstatus_to_exitcode(status), 130)
                        self.assertIn(b"Creation canceled.", reader.transcript)
                    else:
                        self.assertEqual(os.waitstatus_to_exitcode(status), 0)
                        self.assertIn(b"Project created.", reader.transcript)
                finally:
                    os.close(master)
                    os.close(slave)
                    if not waited:
                        os.kill(pid, signal.SIGKILL)
                        os.waitpid(pid, 0)
                    for file in (root / "grandchild.pid", root / "installer.pid"):
                        target = recorded(file) if file.exists() else None
                        try:
                            if target and os.getsid(target) == pid:
                                os.kill(target, signal.SIGKILL)
                        except ProcessLookupError:
                            pass

    def test_node_missing_from_path(self):
        # Minimal images may lack node, and the harness then names it instead of failing on a missing path.
        with tempfile.TemporaryDirectory() as directory:
            run = subprocess.run([sys.executable, __file__, str(cli)], env={"PATH": directory}, capture_output=True,
                                 text=True, timeout=30)
            self.assertNotEqual(run.returncode, 0)
            self.assertIn("The questionnaire harness needs node: install it and run again", run.stderr)

    def test_stop_after_the_launcher_while_a_step_holds_the_loop(self):
        # The shell writes its prompt while the CLI is held in the last synchronous part of the files step, or, with turn,
        # in the continuation of the first wait for pending signals after it, when the step has ended before the stop it
        # deferred. The signals are the ones the terminal sends the group on Ctrl+Z, in the order a launcher sees them.
        for turn in (False, True):
            with self.subTest(turn=turn), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                release = root / "release"
                trace = root / "turn.trace"
                pid, master, slave = start_cli(
                    root, ["app", "--lang", "en", "--mode", "server", "--no-git", "--no-install"],
                    {"NODE_OPTIONS": "--import=data:text/javascript," + quote(HOLD_MODULE), "HOLD_AT": "renameSync",
                     "HOLDING": str(root / "holding"), "RELEASE": str(release), **({"HOLD_TURN": str(trace)} if turn else {})},
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
                    self.assertIsNotNone(launcher)
                    [worker] = children(launcher)
                    self.assertEqual((os.getsid(launcher), os.getsid(worker)), (pid, pid))
                    self.assertEqual((os.getpgid(launcher), os.getpgid(worker)), (launcher, launcher))
                    queued = trace.read_text().splitlines() if turn else []
                    if turn:
                        self.assertIn(queued, (["queue A", "run A"], ["interval", "queue A", "queue B", "run A"]))
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
                    release.touch()
                    deadline = time.monotonic() + 4
                    while "T" not in state(worker):
                        self.assertLess(time.monotonic(), deadline)
                        time.sleep(.01)
                    marked = reader.mark(slave)
                    stopped = bytes(transcript[start:marked])
                    if turn:
                        events = trace.read_text().splitlines()
                        self.assertEqual(events, queued + (["run B"] if "queue B" in queued else []))
                        print(f"Indicator after the shell prompt: {events!r}, {stopped!r}", flush=True)
                    self.assertEqual(stopped, shown)
                    if turn:
                        self.assertEqual(events, ["queue A", "run A"])
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
                    if turn:
                        self.assertEqual(trace.read_text().splitlines(), events)
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
                    reader.mark(slave)
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
                    if stage != b"Application title":
                        # The continue draws the indicator at the new width once; the resize Node reads after it draws nothing more.
                        self.assertEqual(transcript.count(b"\r\x1b[J", continued), 1)
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
                    reader.mark(slave)
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
                        reader.mark(slave)
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
                        outside = reader.mark(slave) + len(MARK)
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
                    reader = Reader(self, term)
                    transcript = reader.transcript
                    waited = False
                    try:
                        labels = [b"Application title", b"Setup", b"Create the project?"]
                        for label in labels:
                            reader.until(label)
                            if label == stage:
                                break
                            os.write(term, b"\r")
                        # The rest of the frame may come in a later read than its title, and it must be read before the offset.
                        reader.until("└\r\n".encode(), transcript.index(stage))
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
        hold = TIMER_HOLD_MODULE
        # The plain subcases guard the cancellation: an installer ended by the signal fails them without the wait for the
        # pending signals when the installer ends, and one that handles the signal and exits with its code fails them
        # without that wait on an exit code. In interactive mode the end of the installer is read only once its stderr pipe
        # closes, behind the signal of the CLI, so those subcases pass either way and keep the closing a cancellation there.
        for interrupt, plain, trapped in itertools.product((signal.SIGTERM, signal.SIGHUP), (False, True), (False, True)):
            with self.subTest(signal=interrupt, plain=plain, trapped=trapped), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                installer = root / "bun"
                if trapped:
                    name = "TERM" if interrupt == signal.SIGTERM else "HUP"
                    installer.write_text(f"#!/bin/sh\ntrap 'kill $child; exit {128 + interrupt}' {name}\nsleep 20 &\n"
                                         'child=$!\necho $$ > "$PID_FILE"\nwait $child\n')
                else:
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
                    # The second line ends in bytes that are not UTF-8, and in a pipe the last one has no newline.
                    installer.write_text("#!/bin/sh\nif [ -t 2 ]; then echo tty >&2; else echo pipe >&2; fi\n"
                                         f"printf 'first\\nsecond \\351\\377\\nthird{ending}' >&2\n"
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
                                self.assertIn(b"\npipe\nfirst\nsecond \xe9\xff\nthird\n", b"\n" + data)
                            self.assertNotIn(b"\x1b[?25", data + (stdout or b""))
                            lines = data.splitlines()
                            start = lines.index(b"first")
                            self.assertEqual(lines[start - 1], b"tty" if terminal else b"pipe")
                            self.assertEqual(lines[start:start + 3], [b"first", b"second \xe9\xff", b"third"])
                            for line in (b"first", b"second \xe9\xff", b"third"):
                                self.assertEqual(lines.count(line), 1)
                            self.assertEqual(child.returncode, status)
                            if status:
                                self.assertEqual([line.decode() for line in lines[start + 3:]], ["▲ Could not install dependencies with Bun",
                                    "Your project is in app. To finish, run:", "cd app", "bun install", "", "Creation stopped."])
                            else:
                                closing = b"\n".join(lines[start + 3:]) if terminal else stdout
                                self.assertIn(b"Dependencies installed with Bun", closing)
                    finally:
                        if terminal:
                            os.close(master)
                            os.close(slave)

    def test_plain_installer_stderr_back_pressure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            installer = root / "bun"
            size = 4 * 1024 * 1024
            installer.write_text(f"#!/bin/sh\nhead -c {size} /dev/zero | tr '\\0' x >&2\n: > \"$DONE\"\n")
            installer.chmod(0o755)
            done = root / "done"
            env = dict(os.environ, CI="false", NO_COLOR="1", TERM="xterm", PATH=str(root) + ":" + os.environ["PATH"], DONE=str(done))
            with subprocess.Popen([node, cli, "app", "--yes", "--lang", "en", "--no-git"], cwd=root, env=env,
                                  stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE) as child:
                try:
                    printed = bytearray()
                    deadline = time.monotonic() + 10
                    while b"Files created\n" not in printed:
                        self.assertTrue(select.select([child.stdout], [], [], max(0, deadline-time.monotonic()))[0], printed)
                        printed.extend(os.read(child.stdout.fileno(), 4096))
                    # With nobody reading stderr, its pipes fill and the installer waits. An installer that the CLI did not hold back ends in milliseconds.
                    time.sleep(1)
                    self.assertFalse(done.exists())
                    _, written = child.communicate(timeout=20)
                    self.assertTrue(done.exists())
                    self.assertEqual(written, b"x" * size + b"\n")
                    self.assertEqual(child.returncode, 0)
                finally:
                    if child.poll() is None:
                        child.kill()

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
                    # A descendant that keeps the installer's stdout open must not keep the CLI running. The installer
                    # ignores SIGINT, so the CLI forces it at the long bound.
                    self.assertEqual(child.wait(timeout=CLEANUP_LIMIT_S + 4), 130)
                finally:
                    grandchild = recorded(root / "app/grandchild.pid") if (root / "app/grandchild.pid").exists() else None
                    if child.poll() is None:
                        child.kill()
                    if grandchild:
                        try:
                            os.kill(grandchild, signal.SIGKILL)
                        except ProcessLookupError:
                            pass

    def read_installer_tail(self, case):
        """Run the plain CLI with an installer whose output passes what the pipes and the buffers of the CLI hold, so it
        exits only while the reader reads. The reader reads slowly until the exit is recorded, then waits as the case
        says, and then reads the rest, which must hold the whole output of the installer.

        quiet waits longer than the short wait for the pipes, bound longer than the long bound, stop stops the group of
        the CLI for longer than the long bound, and signal sends SIGTERM to the CLI and waits longer than the long bound.
        With cleanup the installer writes its output after a cleanup of 4 s that SIGTERM to the CLI starts, and the reader
        waits until the long bound has passed since that signal."""
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            installer = root / "bun"
            size = 512 * 1024
            tail = f"head -c {size} /dev/zero | tr '\\0' t\necho tail-end\n"
            if case == "cleanup":
                cleanup = root / "cleanup"
                cleanup.write_text(f"#!/bin/sh\nsleep 4\n{tail}")
                cleanup.chmod(0o755)
                installer.write_text('#!/bin/sh\ntrap \'"$CLEANUP"; exit 130\' INT\necho $$ > "$PID_FILE"\nwhile :; do sleep .05; done\n')
            else:
                installer.write_text(f"#!/bin/sh\n{tail}")
            installer.chmod(0o755)
            entry, children_file = root / "entry.mjs", root / "children"
            entry.write_text(EXIT_ENTRY)
            env = dict(os.environ, CI="false", NO_COLOR="1", TERM="xterm", PATH=str(root) + ":" + os.environ["PATH"],
                       EXIT_FILE=str(root / "cli.exit"), CLI_URL=cli.as_uri(), CLI_CHILDREN=str(children_file),
                       CLEANUP=str(root / "cleanup"), PID_FILE=str(root / "installer.pid"))
            is_canceled = case in ("signal", "cleanup")
            with subprocess.Popen([node, entry, "app", "--yes", "--lang", "en", "--no-git"], cwd=root, env=env,
                                  stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                  start_new_session=True) as child:
                try:
                    output = child.stdout.fileno()
                    printed = bytearray()
                    def read():
                        self.assertTrue(select.select([output], [], [], 10)[0], printed[-200:])
                        block = os.read(output, 4096)
                        self.assertTrue(block, printed[-200:])
                        printed.extend(block)
                    def exit_record():
                        lines = children_file.read_text().splitlines() if children_file.exists() else []
                        return next((line.split() for line in lines if line.startswith("exit ")), None)
                    while b"Files created\n" not in printed:
                        read()
                    sent = time.monotonic()
                    if case == "cleanup":
                        # A signal before the step starts would cancel it before the installer runs.
                        self.assertIsNotNone(recorded(root / "installer.pid"))
                        child.send_signal(signal.SIGTERM)
                    start = len(printed)
                    while len(printed) - start < 64 * 1024:
                        read()
                    deadline = time.monotonic() + 2
                    while not exit_record() and time.monotonic() < deadline:
                        time.sleep(.01)
                    while not exit_record():
                        read()
                        time.sleep(.01)
                    # When the installer exited the output of the CLI still asked for drain, with bytes waiting for the reader.
                    need_drain, waiting = exit_record()[3:5]
                    self.assertEqual(need_drain, "true", exit_record())
                    self.assertGreater(int(waiting), 0)
                    if case == "quiet":
                        time.sleep(PIPE_DRAIN_S + 1)
                    if case == "bound":
                        time.sleep(CLEANUP_LIMIT_S + 1)
                    if case == "stop":
                        os.killpg(child.pid, signal.SIGSTOP)
                        deadline = time.monotonic() + 4
                        while "T" not in state(child.pid):
                            self.assertLess(time.monotonic(), deadline)
                            time.sleep(.01)
                        time.sleep(CLEANUP_LIMIT_S + 1)
                        os.killpg(child.pid, signal.SIGCONT)
                    if case == "signal":
                        child.send_signal(signal.SIGTERM)
                        time.sleep(CLEANUP_LIMIT_S + 1)
                    if case == "cleanup":
                        time.sleep(max(0, sent + CLEANUP_LIMIT_S + 1 - time.monotonic()))
                    rest, errors = child.communicate(timeout=20)
                    printed.extend(rest)
                    self.assertIn(b"\n" + b"t" * size + b"tail-end\n", printed, (printed.count(b"t"), printed[-300:]))
                    if is_canceled:
                        self.assertEqual(child.returncode, 130, errors)
                        lines = errors.decode().splitlines()
                        self.assertEqual(lines[-6:], ["■ Installing dependencies with Bun", "Your project is in app. To finish, run:",
                                                      "cd app", "bun install", "", "Creation canceled."])
                        if case == "signal":
                            # The installer was gone, so no line says that the CLI waits for it.
                            self.assertNotIn("clean up", errors.decode())
                    else:
                        self.assertEqual((child.returncode, errors), (0, b""))
                        self.assertIn(b"tail-end\n" + "◇ Dependencies installed with Bun\n".encode(), printed)
                finally:
                    if child.poll() is None:
                        os.killpg(child.pid, signal.SIGKILL)

    def test_plain_installer_output_read_after_its_exit(self):
        # The reader stops once the CLI has handled the exit of the installer, for longer than the short wait for the pipes.
        self.read_installer_tail("quiet")

    def test_plain_installer_output_read_after_the_bound(self):
        # While the output holds bytes for its reader, the CLI waits for it however long, and no time counts.
        self.read_installer_tail("bound")

    def test_plain_installer_output_read_after_a_stop(self):
        # A stop of the CLI during the wait for the pipes, longer than the long bound, does not count either.
        self.read_installer_tail("stop")

    def test_plain_cleanup_ending_near_the_long_bound(self):
        # The long bound exists to force the installer, so once the installer has exited it no longer cuts the wait for a
        # slow reader of its output.
        self.read_installer_tail("cleanup")

    def test_plain_first_signal_after_the_installer_exited(self):
        # A first signal once the installer has exited arms no long bound: the CLI waits for the reader as before and then
        # ends as a cancel.
        self.read_installer_tail("signal")

    def test_plain_descendant_writing_after_the_installer(self):
        # A process the installer started keeps writing to its stdout after the installer exited. The CLI lets go of the
        # pipes once more came after the exit than the pipes and the buffers hold, or once the output took data for the
        # long bound, whichever comes first.
        for case in ("fast", "slow"):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                descendant = root / "descendant.pid"
                writer = "yes descendant" if case == "fast" else "while :; do echo descendant; sleep .02; done"
                installer = root / "bun"
                installer.write_text(f'#!/bin/sh\n({writer}) &\necho $! > "$DESCENDANT"\nexit 0\n')
                installer.chmod(0o755)
                entry, children_file = root / "entry.mjs", root / "children"
                entry.write_text(EXIT_ENTRY)
                env = dict(os.environ, CI="false", NO_COLOR="1", TERM="xterm", PATH=str(root) + ":" + os.environ["PATH"],
                           EXIT_FILE=str(root / "cli.exit"), CLI_URL=cli.as_uri(), CLI_CHILDREN=str(children_file),
                           DESCENDANT=str(descendant))
                try:
                    with subprocess.Popen([node, entry, "app", "--yes", "--lang", "en", "--no-git"], cwd=root, env=env,
                                          stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                          start_new_session=True) as child:
                        try:
                            output = child.stdout.fileno()
                            printed = bytearray()
                            exited = None
                            deadline = time.monotonic() + 10 + CLEANUP_LIMIT_S + 4
                            while True:
                                self.assertLess(time.monotonic(), deadline, printed[-200:])
                                if exited is None and children_file.exists() and re.search(r"^exit ", children_file.read_text(), re.M):
                                    exited = time.monotonic()
                                if not select.select([output], [], [], .05)[0]:
                                    continue
                                block = os.read(output, 65536)
                                if not block:
                                    break
                                printed.extend(block)
                                del printed[:-8192]
                            ended = time.monotonic()
                            _, errors = child.communicate(timeout=10)
                        finally:
                            if child.poll() is None:
                                os.killpg(child.pid, signal.SIGKILL)
                    self.assertIsNotNone(exited)
                    self.assertEqual((child.returncode, errors), (0, b""))
                    self.assertIn("◇ Dependencies installed with Bun".encode(), printed)
                    if case == "fast":
                        self.assertLess(ended - exited, CLEANUP_LIMIT_S / 2)
                    else:
                        self.assertGreaterEqual(ended - exited, CLEANUP_LIMIT_S - 1)
                        self.assertLess(ended - exited, CLEANUP_LIMIT_S + 4)
                finally:
                    target = recorded(descendant) if descendant.exists() else None
                    try:
                        if target:
                            os.kill(target, signal.SIGKILL)
                    except ProcessLookupError:
                        pass

    def test_plain_output_closed_during_install(self):
        # The reader of the output of the CLI goes away during the install, before the installer writes a megabyte that no
        # pipe holds. The first write that fails is one of the forward, which fails at once, and there Node resumes the
        # installer by itself. The installer ends, and the CLI drops each failure and ends with nothing on its standard error.
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            go, done = root / "go", root / "done"
            installer = root / "bun"
            size = 1024 * 1024
            installer.write_text(f"#!/bin/sh\nwhile [ ! -e \"$GO\" ]; do sleep .01; done\n"
                                 f"head -c {size} /dev/zero | tr '\\0' z\n: > \"$DONE\"\n")
            installer.chmod(0o755)
            env = dict(os.environ, CI="false", NO_COLOR="1", TERM="xterm", PATH=str(root) + ":" + os.environ["PATH"],
                       GO=str(go), DONE=str(done))
            reader, writer = os.pipe()
            try:
                with subprocess.Popen([node, cli, "app", "--yes", "--lang", "en", "--no-git"], cwd=root, env=env,
                                      stdin=subprocess.DEVNULL, stdout=writer, stderr=subprocess.PIPE) as child:
                    os.close(writer)
                    writer = None
                    try:
                        printed = bytearray()
                        deadline = time.monotonic() + 10
                        while b"Files created\n" not in printed:
                            self.assertTrue(select.select([reader], [], [], max(0, deadline-time.monotonic()))[0], printed)
                            printed.extend(os.read(reader, 4096))
                        os.close(reader)
                        reader = None
                        go.touch()
                        _, errors = child.communicate(timeout=10)
                        self.assertEqual((child.returncode, errors), (0, b""))
                        self.assertTrue(done.exists())
                    finally:
                        if child.poll() is None:
                            child.kill()
            finally:
                for descriptor in (reader, writer):
                    if descriptor is not None:
                        os.close(descriptor)

    def test_plain_waiting_line_to_a_closed_stderr(self):
        # The reader of the standard error of the CLI goes away during the install, while the installer writes nothing
        # there, so the first write that fails on it is the waiting line of the CLI itself. The installer then writes a
        # megabyte to its stderr during its cleanup, more than the pipes and the buffers hold, and still ends it.
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            done, record, pid_file = root / "done", root / "record", root / "installer.pid"
            cleanup = root / "cleanup"
            cleanup.write_text(f"#!/bin/sh\nsleep 2\nhead -c {1024 * 1024} /dev/zero | tr '\\0' e >&2 && : > \"$DONE\"\n")
            cleanup.chmod(0o755)
            installer = root / "bun"
            installer.write_text('#!/bin/sh\ntrap \'"$CLEANUP"; exit 130\' INT\necho $$ > "$PID_FILE"\nwhile :; do sleep .05; done\n')
            installer.chmod(0o755)
            preload = root / "record.mjs"
            preload.write_text(WRITE_RECORD_MODULE)
            env = dict(os.environ, CI="false", NO_COLOR="1", TERM="xterm", PATH=str(root) + ":" + os.environ["PATH"],
                       CLEANUP=str(cleanup), DONE=str(done), PID_FILE=str(pid_file), WRITE_RECORD=str(record))
            reader, writer = os.pipe()
            try:
                with subprocess.Popen([node, "--import", preload.as_uri(), cli, "app", "--yes", "--lang", "en", "--no-git"],
                                      cwd=root, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=writer) as child:
                    os.close(writer)
                    writer = None
                    try:
                        printed = bytearray()
                        deadline = time.monotonic() + 10
                        while b"Files created\n" not in printed:
                            self.assertTrue(select.select([child.stdout], [], [], max(0, deadline-time.monotonic()))[0], printed)
                            printed.extend(os.read(child.stdout.fileno(), 4096))
                        self.assertIsNotNone(recorded(pid_file))
                        os.close(reader)
                        reader = None
                        sent = time.monotonic()
                        child.send_signal(signal.SIGTERM)
                        child.communicate(timeout=CLEANUP_LIMIT_S + 4)
                        elapsed = time.monotonic() - sent
                        lines = record.read_text().splitlines()
                        failed = next((index for index, line in enumerate(lines) if line.startswith("error stderr ")), None)
                        self.assertIsNotNone(failed, lines)
                        written = [line.split()[2] for line in lines[:failed] if line.startswith("write stderr ")]
                        # The path: only writes of the CLI itself reached stderr before its first error.
                        self.assertEqual((written, lines[failed]), (["text"], "error stderr EPIPE"), lines[:failed + 1])
                        self.assertTrue(done.exists(), lines[failed:failed + 5])
                        self.assertEqual(child.returncode, 130)
                        self.assertLess(elapsed, CLEANUP_LIMIT_S)
                    finally:
                        if child.poll() is None:
                            child.kill()
            finally:
                for descriptor in (reader, writer):
                    if descriptor is not None:
                        os.close(descriptor)
                target = recorded(pid_file) if pid_file.exists() else None
                try:
                    if target:
                        os.kill(target, signal.SIGKILL)
                except ProcessLookupError:
                    pass

    def test_plain_output_closed_with_a_forward_write_pending(self):
        # The reader of the output of the CLI stops reading during the install, so a write of the forward waits in the
        # output, below its high-water mark, and then the reader goes away. That write fails later, with no write of the
        # forward having returned false. The installer then writes a megabyte, more than the pipes and the buffers hold,
        # and still ends.
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            pending, ready, go, done, record = (root / name for name in ("pending", "ready", "go", "done", "record"))
            pid_file = root / "installer.pid"
            installer = root / "bun"
            # Lines of 1 KiB, each its own chunk, until one waits in the output of the CLI.
            installer.write_text('#!/bin/sh\necho $$ > "$PID_FILE"\ncount=0\n'
                                 'while [ ! -e "$PENDING" ] && [ $count -lt 1024 ]; do\n'
                                 '  printf "%01023d\\n" 0\n  count=$((count + 1))\n  sleep .01\ndone\n'
                                 ': > "$READY"\nwhile [ ! -e "$GO" ]; do sleep .01; done\n'
                                 f"head -c {1024 * 1024} /dev/zero | tr '\\0' z && : > \"$DONE\"\n")
            installer.chmod(0o755)
            preload = root / "record.mjs"
            preload.write_text(WRITE_RECORD_MODULE)
            env = dict(os.environ, CI="false", NO_COLOR="1", TERM="xterm", PATH=str(root) + ":" + os.environ["PATH"],
                       PENDING=str(pending), READY=str(ready), GO=str(go), DONE=str(done), PID_FILE=str(pid_file),
                       WRITE_RECORD=str(record))
            reader, writer = os.pipe()
            try:
                with subprocess.Popen([node, "--import", preload.as_uri(), cli, "app", "--yes", "--lang", "en", "--no-git"],
                                      cwd=root, env=env, stdin=subprocess.DEVNULL, stdout=writer, stderr=subprocess.PIPE) as child:
                    os.close(writer)
                    writer = None
                    try:
                        printed = bytearray()
                        deadline = time.monotonic() + 10
                        while b"Files created\n" not in printed:
                            self.assertTrue(select.select([reader], [], [], max(0, deadline-time.monotonic()))[0], printed)
                            printed.extend(os.read(reader, 4096))
                        deadline = time.monotonic() + 30
                        while not ready.exists():
                            self.assertLess(time.monotonic(), deadline)
                            time.sleep(.01)
                        def forward_writes():
                            return [line.split() for line in record.read_text().splitlines() if line.startswith("write stdout bytes ")]
                        # The path: a write of the forward waits in the output, and none returned false.
                        writes = forward_writes()
                        self.assertTrue(pending.exists(), writes[-3:])
                        self.assertNotIn("false", [write[4] for write in writes], writes)
                        os.close(reader)
                        reader = None
                        deadline = time.monotonic() + 5
                        while "error stdout EPIPE" not in record.read_text().splitlines():
                            self.assertLess(time.monotonic(), deadline, record.read_text().splitlines()[-3:])
                            time.sleep(.01)
                        self.assertNotIn("false", [write[4] for write in forward_writes()])
                        go.touch()
                        deadline = time.monotonic() + 10
                        while not done.exists() and time.monotonic() < deadline:
                            time.sleep(.01)
                        self.assertTrue(done.exists())
                        _, errors = child.communicate(timeout=10)
                        self.assertEqual((child.returncode, errors), (0, b""))
                    finally:
                        if child.poll() is None:
                            child.kill()
            finally:
                for descriptor in (reader, writer):
                    if descriptor is not None:
                        os.close(descriptor)
                target = recorded(pid_file) if pid_file.exists() else None
                try:
                    if target:
                        os.kill(target, signal.SIGKILL)
                except ProcessLookupError:
                    pass

    def test_plain_output_closed_while_it_asked_for_drain(self):
        # The reader of the output of the CLI stops reading while the installer writes a megabyte, so the output asks for
        # drain, and then goes away. The installer then exits while a process it started keeps its pipes open with nothing
        # to write. The write that failed left the output asking for drain with nothing to write, and the CLI lets go of
        # the pipes after the short wait for them.
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            grandchild, record, children_file = root / "grandchild.pid", root / "record", root / "children"
            installer = root / "bun"
            installer.write_text('#!/bin/sh\nsleep 30 &\necho $! > "$GRANDCHILD"\n'
                                 f"head -c {1024 * 1024} /dev/zero | tr '\\0' d\n")
            installer.chmod(0o755)
            preload, entry = root / "record.mjs", root / "entry.mjs"
            preload.write_text(WRITE_RECORD_MODULE)
            entry.write_text(EXIT_ENTRY)
            env = dict(os.environ, CI="false", NO_COLOR="1", TERM="xterm", PATH=str(root) + ":" + os.environ["PATH"],
                       GRANDCHILD=str(grandchild), WRITE_RECORD=str(record), EXIT_FILE=str(root / "cli.exit"),
                       CLI_URL=cli.as_uri(), CLI_CHILDREN=str(children_file))
            reader, writer = os.pipe()
            try:
                with subprocess.Popen([node, "--import", preload.as_uri(), entry, "app", "--yes", "--lang", "en", "--no-git"],
                                      cwd=root, env=env, stdin=subprocess.DEVNULL, stdout=writer, stderr=subprocess.PIPE) as child:
                    os.close(writer)
                    writer = None
                    try:
                        printed = bytearray()
                        deadline = time.monotonic() + 10
                        while b"Files created\n" not in printed:
                            self.assertTrue(select.select([reader], [], [], max(0, deadline-time.monotonic()))[0], printed)
                            printed.extend(os.read(reader, 4096))
                        def lines():
                            return record.read_text().splitlines() if record.exists() else []
                        deadline = time.monotonic() + 10
                        while not any(line.startswith("write stdout bytes ") and line.split()[4] == "false" for line in lines()):
                            self.assertLess(time.monotonic(), deadline, lines()[-3:])
                            time.sleep(.01)
                        os.close(reader)
                        reader = None
                        _, errors = child.communicate(timeout=CLEANUP_LIMIT_S + 4)
                        ended = time.time()
                    finally:
                        if child.poll() is None:
                            child.kill()
                # The path: a write of the forward returned false, and the output failed after it.
                self.assertIn("error stdout EPIPE", lines())
                self.assertEqual((child.returncode, errors), (0, b""))
                # The record ends with the time of the exit, in milliseconds since the epoch.
                [exited] = [float(line.split()[-1]) / 1000 for line in children_file.read_text().splitlines() if line.startswith("exit ")]
                self.assertLess(ended - exited, PIPE_DRAIN_S + 1.5)
            finally:
                for descriptor in (reader, writer):
                    if descriptor is not None:
                        os.close(descriptor)
                target = recorded(grandchild) if grandchild.exists() else None
                try:
                    if target:
                        os.kill(target, signal.SIGKILL)
                except ProcessLookupError:
                    pass

    def test_output_reports_respect_known_stream_failures(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            preload = root / "output-order.mjs"
            preload.write_text(OUTPUT_ORDER_MODULE)
            for primary, alternate, label in (("stdout", "stderr", "output"), ("stderr", "stdout", "error")):
                fatal, lost = (primary, "ENOSPC", False), (alternate, "EPIPE", False)
                eio_tty = (primary, "EIO", True)
                cases = (
                    ("lost before fatal", (lost, fatal), "", 1, False),
                    ("lost after fatal", (fatal, lost), "", 1, False),
                    ("second fatal known", (fatal, (alternate, "EIO", False)), "", 1, False),
                    ("failure during report", (fatal,), "EPIPE", 1, True),
                    ("fatal after toleration on same output", ((primary, "EPIPE", False), fatal), "", 1, True),
                    ("only tolerated errors", (eio_tty, lost), "", 0, False),
                    ("only EPIPE", (lost,), "", 0, False),
                    ("only EIO on TTY", (eio_tty,), "", 0, False),
                )
                for index, (case, events, during_report, status, expects_report) in enumerate(cases):
                    with self.subTest(primary=primary, case=case):
                        trace = root / f"{primary}-{index}"
                        env = dict(os.environ, OUTPUT_EVENTS=json.dumps(events), OUTPUT_TRACE=str(trace),
                                   OUTPUT_MARK="", REPORT_FAILURE=during_report, NO_COLOR="1", FORCE_COLOR="0")
                        run = subprocess.run([node, "--import", preload.as_uri(), cli, "--lang", "en", "--help"],
                                             env=env, capture_output=True, timeout=8)
                        entries = [json.loads(line) for line in trace.read_text().splitlines()]
                        outcome = [["display accepted", True], *[["observed", name, code] for name, code, _ in events]]
                        if expects_report:
                            outcome.append(["report attempt", alternate, f"Could not write to the standard {label}: ENOSPC.\n"])
                        if during_report:
                            outcome.append(["reported during write", alternate, during_report])
                        outcome.append(["exit", status])
                        print(f"Output sequence {primary}, {case}: {entries!r}", flush=True)
                        self.assertEqual(run.returncode, status, run.stderr)
                        self.assertEqual(entries, outcome)

    def test_prompt_closes_without_writing_after_both_outputs_are_lost(self):
        for primary, alternate in (("stdout", "stderr"), ("stderr", "stdout")):
            with self.subTest(primary=primary), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                preload, trace = root / "output-order.mjs", root / "trace"
                preload.write_text(OUTPUT_ORDER_MODULE)
                events = ((alternate, "EPIPE", False), (primary, "ENOSPC", False))
                _, status = question_session(
                    directory, "en", [("Application title", b"")], errors=root / "stderr", preload=preload,
                    environment={"OUTPUT_EVENTS": json.dumps(events), "OUTPUT_TRACE": str(trace),
                                 "OUTPUT_MARK": "Application title", "REPORT_FAILURE": ""})
                entries = [json.loads(line) for line in trace.read_text().splitlines()]
                print(f"Closing a prompt with both outputs lost, {primary}: {entries!r}", flush=True)
                self.assertEqual(status, 1)
                self.assertEqual(entries, [["display accepted", True], ["observed", alternate, "EPIPE"],
                                           ["observed", primary, "ENOSPC"], ["exit", 1]])
                self.assertFalse((root / "app").exists())

    def test_installer_closes_without_separator_after_both_outputs_are_lost(self):
        for primary, alternate in (("stdout", "stderr"), ("stderr", "stdout")):
            with self.subTest(primary=primary), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                preload, trace = root / "output-order.mjs", root / "trace"
                preload.write_text(OUTPUT_ORDER_MODULE)
                installer = root / "bun"
                source = root / "installer.cjs"
                marker = "partial installer line"
                source.write_text(
                    f"process.on('SIGINT', () => process.exit(130)); "
                    f"process.{primary}.write({json.dumps(marker)}); "
                    "setTimeout(() => process.exit(23), 3000);")
                installer.write_text(f"#!/bin/sh\nexec {shlex.quote(node)} {shlex.quote(str(source))}\n")
                installer.chmod(0o755)
                events = ((alternate, "EPIPE", False), (primary, "ENOSPC", False))
                env = dict(os.environ, OUTPUT_EVENTS=json.dumps(events), OUTPUT_TRACE=str(trace), OUTPUT_MARK=marker,
                           OUTPUT_TRIGGER_STREAM=primary, REPORT_FAILURE="", NO_COLOR="1", FORCE_COLOR="0",
                           PATH=directory + os.pathsep + os.environ["PATH"])
                run = subprocess.run(
                    [node, "--import", preload.as_uri(), cli, "app", "--yes", "--lang", "en", "--no-git"],
                    cwd=root, env=env, stdin=subprocess.DEVNULL, capture_output=True, timeout=8, start_new_session=True)
                entries = [json.loads(line) for line in trace.read_text().splitlines()]
                print(f"Closing an installer with both outputs lost, {primary}: {entries!r}", flush=True)
                self.assertEqual(run.returncode, 1, run.stderr)
                self.assertEqual(entries, [["display accepted", True], ["observed", alternate, "EPIPE"],
                                           ["observed", primary, "ENOSPC"], ["exit", 1]])

    def test_output_error_on_a_file(self):
        # On a terminal EIO means that the terminal closed, and the CLI goes on. On a file it is a failure of the disk: the
        # CLI stops the generation as a signal does, before it creates the files, and ends with code 1 and one short line
        # on its standard error.
        for terminal in (False, True):
            with self.subTest(terminal=terminal), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                preload = root / "output-error.mjs"
                preload.write_text(OUTPUT_ERROR_MODULE)
                env = dict(os.environ, CI="false", NO_COLOR="1", TERM="xterm")
                master, slave = pty.openpty() if terminal else (None, None)
                try:
                    with open(root / "output", "wb") as file, subprocess.Popen(
                            [node, "--import", preload.as_uri(), cli, "app", "--yes", "--lang", "en", "--no-git", "--no-install"],
                            cwd=root, env=env, stdin=subprocess.DEVNULL, stdout=slave or file, stderr=subprocess.PIPE) as child:
                        try:
                            if terminal:
                                os.close(slave)
                                slave = None
                                deadline = time.monotonic() + 20
                                while child.poll() is None:
                                    self.assertLess(time.monotonic(), deadline)
                                    if select.select([master], [], [], .05)[0]:
                                        try:
                                            os.read(master, 65536)
                                        except OSError:
                                            break
                            _, errors = child.communicate(timeout=20)
                        finally:
                            if child.poll() is None:
                                child.kill()
                finally:
                    for descriptor in (master, slave):
                        if descriptor is not None:
                            os.close(descriptor)
                if terminal:
                    self.assertEqual((child.returncode, errors), (0, b""))
                else:
                    self.assertEqual((child.returncode, errors), (1, b"Could not write to the standard output: EIO.\n"))
                    self.assertFalse((root / "app").exists())

    def test_output_error_during_cleanup(self):
        # A write to a file that fails during the install, with EIO or ENOSPC as on a full disk, stops the CLI as a signal
        # does: the installer gets SIGINT and ends its cleanup of about 1.5 s, and the CLI ends with code 1, the waiting
        # line for an output error, one short line and the commands left to run, on its standard error.
        for code in ("EIO", "ENOSPC"):
            with self.subTest(code=code), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                (root / "installer.js").write_text(CLEANING_INSTALLER)
                installer = root / "bun"
                installer.write_text(f"#!/bin/sh\nexec {shlex.quote(node)} {shlex.quote(str(root / 'installer.js'))}\n")
                installer.chmod(0o755)
                preload = root / "output-error.mjs"
                preload.write_text(OUTPUT_ERROR_MODULE)
                trigger, cleaned, pid_file = root / "output-error", root / "cleaned", root / "installer.pid"
                env = dict(os.environ, CI="false", NO_COLOR="1", TERM="xterm", PATH=str(root) + ":" + os.environ["PATH"],
                           PID_FILE=str(pid_file), CLEANING=str(root / "cleaning"), CLEANED=str(cleaned),
                           FINISH=str(root / "finish"), CLEANUP_MS="1500", OUTPUT_ERROR=str(trigger))
                try:
                    with open(root / "output", "wb") as file, subprocess.Popen(
                            [node, "--import", preload.as_uri(), cli, "app", "--yes", "--lang", "en", "--no-git"],
                            cwd=root, env=env, stdin=subprocess.DEVNULL, stdout=file, stderr=subprocess.PIPE) as child:
                        try:
                            self.assertIsNotNone(recorded(pid_file))
                            trigger.write_text(code)
                            _, errors = child.communicate(timeout=CLEANUP_LIMIT_S + 4)
                        finally:
                            if child.poll() is None:
                                child.kill()
                    self.assertTrue(cleaned.exists(), errors)
                    self.assertEqual((child.returncode, errors.decode().splitlines()), (1, [
                        ERROR_WAITING_LINE, f"Could not write to the standard output: {code}.",
                        "Your project is in app. To finish, run:", "cd app", "bun install"]))
                finally:
                    target = recorded(pid_file) if pid_file.exists() else None
                    try:
                        if target:
                            os.kill(target, signal.SIGKILL)
                    except ProcessLookupError:
                        pass

    def test_first_real_signal_after_output_error(self):
        cases = (
            ("first INT", (("SIGINT", 100),), None, False),
            ("first TERM", (("SIGTERM", 100),), None, False),
            ("first HUP", (("SIGHUP", 100),), None, False),
            ("same signal at 149 and 150 ms", (("SIGINT", 100), ("SIGINT", 249), ("SIGINT", 250)), 250, False),
            ("different signal within the window", (("SIGINT", 100), ("SIGTERM", 100)), 100, False),
            ("HUP first and repeated, then TERM", (("SIGHUP", 100), ("SIGHUP", 249), ("SIGTERM", 249)), 249, False),
            ("HUP never forces", (("SIGTERM", 100), ("SIGHUP", 250), ("SIGHUP", 251)), None, False),
            ("fatal error after a signal", (("SIGINT", 100),), None, True),
        )
        for case, signals, force_at, signal_first in cases:
            with self.subTest(case=case), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                worker_file, trace, errors, clock = (root / name for name in ("installer.pid", "trace", "stderr", "clock"))
                finish, cleaned, cleaning, failure, notice = (root / name for name in ("finish", "cleaned", "cleaning", "failure", "notice"))
                clock.write_text("0")
                installer = root / "bun"
                (root / "installer.cjs").write_text(CLEANING_INSTALLER)
                installer.write_text(f"#!/bin/sh\nexec {shlex.quote(node)} {shlex.quote(str(root / 'installer.cjs'))}\n")
                installer.chmod(0o755)
                preload, control = root / "failure.mjs", root / "signal-order.mjs"
                preload.write_text(OUTPUT_ERROR_MODULE)
                control.write_text(SIGNAL_ORDER_MODULE)
                env = dict(os.environ, CI="false", NO_COLOR="1", TERM="xterm", PATH=directory + os.pathsep + os.environ["PATH"],
                           PID_FILE=str(worker_file), SIGNAL_TRACE=str(trace), SIGNAL_CLOCK=str(clock), NOTICE_RELEASE=str(notice),
                           OUTPUT_ERROR=str(failure), FINISH=str(finish), CLEANED=str(cleaned), CLEANING=str(cleaning), CLEANUP_MS="")
                with open(root / "stdout", "wb") as stdout, errors.open("wb") as stderr, subprocess.Popen(
                        [node, "--import", preload.as_uri(), "--import", control.as_uri(), cli, "app", "--yes",
                         "--lang", "en", "--no-git"], cwd=root, env=env, start_new_session=True,
                        stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr) as child:
                    worker = None
                    def belongs(pid):
                        try:
                            return (os.getsid(pid), os.getpgid(pid)) == (child.pid, child.pid)
                        except ProcessLookupError:
                            return False
                    def entries():
                        return [json.loads(line) for line in trace.read_text().splitlines()] if trace.exists() else []
                    def wait(check, detail):
                        deadline = time.monotonic() + 5
                        while not check():
                            self.assertLess(time.monotonic(), deadline, (detail, entries()))
                            time.sleep(.01)
                    def send(name, at):
                        self.assertIsNone(child.poll())
                        self.assertTrue(belongs(child.pid))
                        staged = clock.with_suffix(".next")
                        staged.write_text(str(at))
                        staged.replace(clock)
                        child.send_signal(getattr(signal, name))
                        wait(lambda: ["handled", name, at] in entries(), (name, at))
                    try:
                        worker = recorded(worker_file)
                        self.assertIsNotNone(worker)
                        self.assertTrue(belongs(worker))
                        first = signals[0]
                        if signal_first:
                            send(*first)
                        else:
                            failure.write_text("ENOSPC")
                        wait(cleaning.exists, "cleanup started")
                        wait(lambda: ["notice armed"] in entries(), "notice armed")
                        if signal_first:
                            failure.write_text("ENOSPC")
                        else:
                            send(*first)
                        wait(lambda: ["output error", "ENOSPC"] in entries(), "output error handled")
                        notice.touch()
                        wait(lambda: "Waiting" in errors.read_text() or child.poll() is not None, "waiting notice written")
                        for delivery in signals[1:]:
                            if child.poll() is not None:
                                break
                            send(*delivery)
                        finish.touch()
                        status = child.wait(timeout=8)
                        events = entries()
                        print(f"Output error and external signal, {case}: {events!r}, cleaned={cleaned.exists()}, exit={status}", flush=True)
                        exit_index = events.index(["installer exit", worker])
                        deadlines = [event for event in events[:exit_index] if event[0] == "deadline armed"]
                        started = first[1] if signal_first else 0
                        self.assertEqual(deadlines, [["deadline armed", started]])
                        expected = [["child signal", worker, "SIGINT", started]]
                        if force_at is not None:
                            expected.append(["child signal", worker, "SIGKILL", force_at])
                        self.assertEqual([event for event in events if event[0] == "child signal"], expected)
                        self.assertEqual(cleaned.exists(), force_at is None)
                        self.assertEqual(status, 1)
                        self.assertEqual(errors.read_text().splitlines(), [
                            WAITING_LINE if signal_first else ERROR_WAITING_LINE,
                            "Could not write to the standard output: ENOSPC.",
                            "Your project is in app. To finish, run:", "cd app", "bun install"])
                    finally:
                        finish.touch()
                        if worker and belongs(worker):
                            os.kill(worker, signal.SIGKILL)
                        if child.poll() is None and belongs(child.pid):
                            child.kill()

    def test_cleanup_notice_uses_an_available_output(self):
        cases = (
            ("framed", (("stdout", "ENOSPC"),), "stderr"),
            ("plain", (("stderr", "ENOSPC"),), "stdout"),
            ("both lost", (("stdout", "EPIPE"), ("stderr", "ENOSPC")), None),
        )
        for case, failures, destination in cases:
            with self.subTest(case=case), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                trace, ready, trigger, done = (root / name for name in ("trace", "installer.pid", "trigger", "notice"))
                finish, cleaning, cleaned = (root / name for name in ("finish", "cleaning", "cleaned"))
                installer, preload = root / "bun", root / "notice.mjs"
                (root / "installer.cjs").write_text(CLEANING_INSTALLER)
                installer.write_text(f"#!/bin/sh\nexec {shlex.quote(node)} {shlex.quote(str(root / 'installer.cjs'))}\n")
                installer.chmod(0o755)
                preload.write_text(NOTICE_OUTPUT_MODULE)
                env = dict(os.environ, CI="false", NO_COLOR="1", TERM="xterm", PATH=directory + os.pathsep + os.environ["PATH"],
                           PID_FILE=str(ready), FINISH=str(finish), CLEANING=str(cleaning), CLEANED=str(cleaned), CLEANUP_MS="",
                           NOTICE_TRACE=str(trace), NOTICE_DONE=str(done), NOTICE_ERRORS=str(trigger))
                framed = case == "framed"
                master, slave = pty.openpty() if framed else (None, None)
                args = ["--mode", "server"] if framed else ["--yes"]
                try:
                    if framed:
                        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 80, 0, 0))
                    with (root / "stdout").open("wb") as stdout, (root / "stderr").open("wb") as stderr, subprocess.Popen(
                            [node, "--import", preload.as_uri(), cli, "app", "--lang", "en", "--no-git", "--install", *args],
                            env=env, cwd=root, start_new_session=True, stdout=slave if framed else stdout, stderr=stderr,
                            stdin=slave if framed else subprocess.DEVNULL) as child:
                        worker = None
                        try:
                            if framed:
                                reader = Reader(self, master)
                                for prompt in (b"Application title", b"Setup", b"Create the project?"):
                                    reader.until(prompt)
                                    os.write(master, b"\r")
                                deadline = time.monotonic() + 8
                                while not ready.exists() and child.poll() is None and time.monotonic() < deadline:
                                    reader.drain()
                                    time.sleep(.01)
                            worker = recorded(ready)
                            if worker is None and framed:
                                reader.drain()
                                self.fail((child.poll(), (root / "stderr").read_text(), reader.transcript[-1200:]))
                            self.assertIsNotNone(worker)
                            self.assertEqual((os.getsid(worker), os.getpgid(worker)), (child.pid, child.pid))
                            staged = trigger.with_suffix(".next")
                            staged.write_text(json.dumps(failures))
                            staged.replace(trigger)
                            self.assertEqual(recorded(cleaning), 1)
                            self.assertEqual(recorded(done), 1)
                            finish.touch()
                            status = child.wait(timeout=8)
                            entries = [json.loads(line) for line in trace.read_text().splitlines()]
                            expected = [["failure", name, code] for name, code in failures]
                            if destination:
                                expected.append(["notice", destination])
                            print(f"Cleanup notice destination, {case}: {entries!r}, exit={status}", flush=True)
                            self.assertEqual(entries, expected)
                            self.assertTrue(cleaned.exists())
                            self.assertEqual(status, 1)
                        finally:
                            finish.touch()
                            try:
                                if worker and (os.getsid(worker), os.getpgid(worker)) == (child.pid, child.pid):
                                    os.kill(worker, signal.SIGKILL)
                            except ProcessLookupError:
                                pass
                            if child.poll() is None:
                                child.kill()
                finally:
                    for descriptor in (master, slave):
                        if descriptor is not None:
                            os.close(descriptor)

    def test_output_error_at_a_question(self):
        # A write that fails at a question with a code that is no closed terminal ends the CLI with code 1 and one short line
        # on the standard error.
        with tempfile.TemporaryDirectory() as directory:
            errors, trigger = pathlib.Path(directory, "stderr"), pathlib.Path(directory, "output-error")
            preload = pathlib.Path(directory, "output-error.mjs")
            preload.write_text(OUTPUT_ERROR_MODULE)
            _, status = question_session(directory, "en", [("Application title", b"")],
                                         before_answer=lambda label: trigger.write_text("ENOSPC"), errors=errors,
                                         preload=preload, environment={"OUTPUT_ERROR": str(trigger)})
            self.assertEqual((status, errors.read_text()), (1, "Could not write to the standard output: ENOSPC.\n"))

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

    def test_end_of_input_at_a_question(self):
        # Ctrl+D cancels at a select, a multiselect or a confirm, whatever keys came before it, and at a text question while
        # the value is empty. Keys read after it in the same write never reach the question. Read with the key that answered
        # a question, it gives what it gives in a read of its own at what comes next: the next question cancels, and after the
        # last confirm the project is created.
        select = [("Application title", b"\r")]
        cancels = [
            ("an empty value", [("Application title", b"\x04")]),
            ("an empty value with Enter in the same read", [("Application title", b"\x04\r")]),
            ("a select", [*select, ("Setup", b"\x04")]),
            *((f"a select after {name}", [*select, ("Setup", key + b"\x04")])
              for name, key in (("j", b"j"), ("k", b"k"), ("h", b"h"), ("l", b"l"), ("space", b" "), ("a letter", b"x"))),
            ("a select after a letter with an arrow in the same read", [*select, ("Setup", b"x\x04\x1b[B")]),
            ("a multiselect after space", [*select, ("Setup", b"\x1b[B\r"), ("Features", b" \x04")]),
            ("a confirm", [*select, ("Setup", b"\r"), ("Create the project?", b"\x04")]),
            ("a confirm after l", [*select, ("Setup", b"\r"), ("Create the project?", b"l\x04")]),
            ("a value with Enter and the Ctrl+D in the same read", [("Application title", b"abc\r\x04")]),
            ("a value with Enter and the Ctrl+D in a read of its own", [("Application title", b"abc\r"), ("Setup", b"\x04")]),
        ]
        creates = [
            *((f"a confirm answered with {name} and the Ctrl+D in the same read",
               [*select, ("Setup", b"\r"), ("Create the project?", key + b"\x04")]) for name, key in (("y", b"y"), ("Enter", b"\r"))),
            *((f"a confirm answered with {name} and the Ctrl+D in a read of its own",
               [*select, ("Setup", b"\r"), ("Create the project?", key), ("Creating the files", b"\x04")])
              for name, key in (("y", b"y"), ("Enter", b"\r"))),
        ]
        # With text, readline deletes to the right, which at the end of the value does nothing, and the question goes on.
        # Clack still reads the key that follows. A Ctrl+C there comes in a write of its own after a render that only the key
        # before it gives: a readline closed by the Ctrl+D would pause the input before it.
        stays = [
            ("a value", [("Application title", b"ab"), ("ab", b"\x04c"), ("abc", b"\x03")], ["■  Application title", "│  abc"]),
            ("a value with Enter in the same read", [("Application title", b"ab"), ("ab", b"\x04\r"), ("Setup", b"\x03")],
             ["■  Setup", "│  Recommended"]),
            # A value that failed its check keeps its text and its error until the next key, and Ctrl+D keeps it too.
            ("a value with an error", [("Application title", b"  \r"), ("not only spaces", b"\x04c"), ("  c", b"\x03")],
             ["■  Application title", "│    c"]),
            # n closes the confirm and leaves raw mode, so the Ctrl+D after it does nothing and n cancels as it does alone.
            ("a confirm answered with n and the Ctrl+D in the same read", [*select, ("Setup", b"\r"), ("Create the project?", b"n\x04")],
             ["◇  Create the project?", "│  No", "│", "└  Creation canceled."]),
        ]
        for name, prompts, *kept in [*cancels, *stays, *((name, prompts, None) for name, prompts in creates)]:
            with self.subTest(case=name), tempfile.TemporaryDirectory() as directory:
                errors = pathlib.Path(directory, "stderr")
                output, status = question_session(directory, "en", prompts, errors=errors)
                written = errors.read_text()
                cursor = re.findall(r"\x1b\[\?25[hl]", output)[-1:]
                plain = re.sub(r"\x1b\[[0-9;?]*[A-Za-z]", "", output).replace("\r", "").rstrip().splitlines()
                print(f"Measured, Ctrl+D at a question with {name}:", json.dumps({
                    "system": sys.platform, "cli_exit": status, "cli_stderr": written.splitlines(), "last_cursor": cursor,
                    "last_lines": plain[-2:]}), flush=True)
                is_created = kept == [None]
                self.assertEqual((status, written), (0 if is_created else 130, ""))
                self.assertEqual(cursor, ["\x1b[?25h"])
                self.assertEqual(plain[-1], "└  Project created." if is_created else "└  Creation canceled.")
                if kept and not is_created:
                    final = re.sub(r"\x1b\[\?25[hl]", "", output.rsplit("\x1b[J", 1)[-1])
                    self.assertEqual(final.rstrip().splitlines()[:len(kept[0])], kept[0])
        # The questions that recover a missing Git or installer cancel on Ctrl+D as the other questions do, whatever keys
        # came before it.
        for name, flags, prompts in [
            ("the confirm of a missing Git after l", ["--git", "--no-install"], [*select, ("Setup", b"\r"), ("Install Git", b"l\x04")]),
            ("the select of a missing installer after j", ["--no-git", "--install"],
             [*select, ("Setup", b"\r"), ("Install Bun before", b"j\x04")]),
        ]:
            with self.subTest(case=name), tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as tools:
                errors = pathlib.Path(directory, "stderr")
                output, status = question_session(directory, "en", prompts, errors=errors, flags=flags, environment={"PATH": tools})
                plain = re.sub(r"\x1b\[[0-9;?]*[A-Za-z]", "", output).replace("\r", "").rstrip().splitlines()
                self.assertEqual((status, errors.read_text()), (130, ""))
                self.assertEqual(plain[-1], "└  Creation canceled.")

    def test_input_error_at_a_question(self):
        # An error of the input at a question, while the terminal still shows what the CLI writes. A closed terminal answers
        # with ENOENT on macOS and EIO on Linux, and any other code is a failure. After the end of the input the CLI cancels,
        # and the error of its own change of mode cancels too, whatever its code.
        canceled = ["└  Creation canceled."]
        for code, ends, expected, closing in (("ENOENT", False, 130, canceled), ("EIO", False, 130, canceled),
                                              ("EPERM", False, 1, ["▲  setRawMode EPERM", "└  Creation stopped."]),
                                              ("EPERM", True, 130, canceled)):
            with self.subTest(code=code, ends=ends), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                (root / "input-error.mjs").write_text(INPUT_ERROR_MODULE)
                trigger, errors = root / "input.error", root / "stderr"
                output, status = question_session(directory, "en", [("Application title", b"")],
                                                  before_answer=lambda label: trigger.write_text(code), errors=errors,
                                                  preload=root / "input-error.mjs",
                                                  environment={"INPUT_ERROR": str(trigger), **({"INPUT_END": "1"} if ends else {})})
                written = errors.read_text()
                plain = re.sub(r"\x1b\[[0-9;?]*[A-Za-z]", "", output).replace("\r", "").rstrip().splitlines()
                self.assertEqual((status, written), (expected, ""))
                self.assertEqual(re.findall(r"\x1b\[\?25[hl]", output)[-1:], ["\x1b[?25h"])
                self.assertEqual(plain[-len(closing):], closing)

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
        languages = [
            ("en", "Application title", "Setup", "Create the project?", "Project summary", "Project directory"),
            ("pt-BR", "Título da aplicação", "Configuração", "Criar o projeto?", "Resumo do projeto", "Pasta do projeto"),
            ("es", "Título de la aplicación", "Configuración", "¿Crear el proyecto?", "Resumen del proyecto", "Carpeta del proyecto"),
        ]
        for (language, title, setup, create, summary, label), (columns, pieces) in itertools.product(languages, [
            (80, [parent, middle + "app"]),
            (40, [parent[:34], parent[34:], middle[:34], middle[34:] + "app"]),
        ]):
            with self.subTest(language=language, columns=columns), tempfile.TemporaryDirectory() as directory:
                output, status = question_session(directory, language, [
                    (title, b"\r"), (setup, b"\r"), (create, b"\x03")
                ], columns=columns, name=name)
                self.assertEqual(status, 130)
                self.assertEqual("".join(pieces), name)
                lines = output.replace("\r\n", "\n").splitlines()
                top = next(index for index, line in enumerate(lines) if line.startswith("◇  " + summary))
                bottom = next(index for index, line in enumerate(lines) if line.startswith("├"))
                box = lines[top:bottom + 1]
                self.assertEqual(len({len(line) for line in box}), 1, box)
                self.assertLessEqual(len(box[0]), columns)
                content = [line[3:-1].rstrip() for line in box[1:-1]]
                self.assertTrue(all(line.startswith("│  ") and line.endswith("│") for line in box[1:-1]), box)
                self.assertEqual(content[:len(pieces) + 3], ["", label + ":", *pieces, title + ": app"])

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

    def test_tall_question_after_fg(self):
        # A text question with a value taller than the screen, stopped and continued by bash with job control in a tmux
        # window of 12 rows.
        self.assertIsNotNone(shutil.which("tmux"), "The tmux tests of the questionnaire harness need tmux: install it and run again")
        self.assertIsNotNone(bash_path(), "The tmux tests of the questionnaire harness need bash: install it and run again")
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            socket = str(root / "tmux.sock")
            # SHELL keeps the login shell of the account, and the PATH it sets, out of the commands of tmux.
            tmux_env = {key: os.environ[key] for key in ("HOME", "PATH", "LANG", "TMPDIR") if key in os.environ} | {"SHELL": "/bin/sh"}
            def tmux(*args):
                return subprocess.check_output(["tmux", "-f", "/dev/null", "-S", socket, *args], env=tmux_env, text=True, timeout=5)
            def capture(history=False):
                return tmux("capture-pane", "-p", *(["-S", "-100"] if history else [])).rstrip("\n").split("\n")
            def processes():
                tty = tmux("display", "-p", "#{pane_tty}").strip().removeprefix("/dev/")
                version = subprocess.run([bash_path(), "--version"], capture_output=True, text=True).stdout.split("\n")[0]
                table = subprocess.run(["ps", "-o", "pid,ppid,pgid,tpgid,stat,args", "-t", tty], capture_output=True, text=True).stdout
                return f"{version}\n{table}"
            def wait_for(check, history=False):
                deadline = time.monotonic() + 10
                while time.monotonic() < deadline:
                    lines = capture(history)
                    if check(lines):
                        return lines
                    time.sleep(.04)
                # The state of each process of the pane tells a CLI that did not stop from a shell that wrote nothing.
                self.fail(f"{capture(history)}\n{processes()}")
            command = shlex.join(["env", "CI=false", "NO_COLOR=1", "TERM=xterm", node, str(cli),
                                  "app", "--lang", "en", "--mode", "server", "--no-git", "--no-install"])
            go = root / "go"
            script = f"{command}; until [ -e {shlex.quote(str(go))} ]; do sleep .05; done; fg"
            tmux("new-session", "-d", "-x", "80", "-y", "12", "-c", directory, "/bin/sh")
            try:
                tmux("set-option", "remain-on-exit", "on")
                tmux("respawn-pane", "-k", "-c", directory, "exec " + shlex.join([bash_path(), "--norc", "--noprofile", "-i", "-c", script]))
                wait_for(lambda lines: "└" in lines[-1])
                value = "x" * 760
                tmux("send-keys", "-l", value)
                full = "│  " + "x" * 77
                # Ten rows of the value with the bar, the title, the end row and the line of the cursor do not fit in 12 rows,
                # so the question shows the last seven rows of the value below a row of ... and stays on the screen.
                head = ["│", "◆  Application title", "│  ..."]
                wait_for(lambda lines: lines[-2:] == ["│  " + "x" * 67 + "█", "└"] and lines[:3] == head)
                [worker] = children(int(tmux("display", "-p", "#{pane_pid}")))
                tmux("send-keys", "C-z")
                # bash 5 writes no notice when a job of -c stops, so the stop is read from the state of the CLI.
                deadline = time.monotonic() + 10
                while "T" not in state(worker):
                    self.assertLess(time.monotonic(), deadline, processes())
                    time.sleep(.04)
                go.touch()
                # Ctrl+Z erases the question, which is all on the screen, and after fg the whole question is drawn again below
                # what the shell wrote, so its title is there once.
                cursor_row = "│  " + "x" * 67 + "█"
                wait_for(lambda lines: "T" not in state(worker) and lines[-2:] == [cursor_row, "└"]
                         and lines.count(cursor_row) == 1
                         and sum(line == "◆  Application title" for line in lines) == 1, history=True)
                tmux("send-keys", "-l", "y")
                # Clack redraws the changed row at the row it expects, so the screen shows the question once, with the key on its
                # last row of value.
                wait_for(lambda lines: lines == head + [full] * 6 + ["│  " + "x" * 67 + "y█", "└"])
                tmux("send-keys", "C-c")
                wait_for(lambda lines: "└  Creation canceled." in lines)
            finally:
                tmux("kill-server")

    def test_tall_title_shrinking_in_history(self):
        # 222 Backspace in a title of 760 characters, in a tmux window of 12 rows with scroll-on-clear on.
        self.assertIsNotNone(shutil.which("tmux"), "The tmux tests of the questionnaire harness need tmux: install it and run again")
        self.assertIsNotNone(bash_path(), "The tmux tests of the questionnaire harness need bash: install it and run again")
        with tempfile.TemporaryDirectory() as directory:
            command = shlex.join(["env", "CI=false", "NO_COLOR=1", "TERM=xterm", node, str(cli),
                                  "app", "--lang", "en", "--mode", "server", "--no-git", "--no-install"])
            pane = Pane(self, pathlib.Path(directory), command, 12)
            try:
                pane.wait_for(lambda lines: "└" in lines[-1])
                pane.tmux("send-keys", "-l", "x" * 760)
                pane.wait_for(lambda lines: lines[-2:] == ["│  " + "x" * 67 + "█", "└"])
                pane.tmux("send-keys", "-N", "222", "BSpace")
                pane.wait_for(lambda lines: lines[-2:] == ["│  " + "x" * 76 + "█", "└"])
                history, screen = pane.split()
                # No row of the open question reaches the history, so its title is on the screen once.
                title = "◆  Application title"
                self.assertEqual((history + screen).count(title), 1, (history, screen))
                self.assertFalse([line for line in history if line.startswith("│  x")], history)
                pane.tmux("send-keys", "C-c")
                pane.wait_for(lambda lines: "└  Creation canceled." in lines)
            finally:
                pane.close()

    def test_question_outside_stop_after_arrow_up(self):
        # Under a launcher that leaves the terminal to its shell, a stop sent from outside to the group of the job after an
        # arrow up at a title of spaces only that failed its check, in a tmux window of 12 rows with scroll-on-clear on.
        self.assertIsNotNone(shutil.which("tmux"), "The tmux tests of the questionnaire harness need tmux: install it and run again")
        self.assertIsNotNone(bash_path(), "The tmux tests of the questionnaire harness need bash: install it and run again")
        with tempfile.TemporaryDirectory() as directory:
            command = shlex.join([bash_path(), "-c", shlex.join(["env", "CI=false", "NO_COLOR=1", "TERM=xterm", node, str(cli),
                                  "app", "--lang", "en", "--mode", "server", "--no-git", "--no-install"]) + "; exit 0"])
            pane = Pane(self, pathlib.Path(directory), command, 12)
            try:
                pane.wait_for(lambda lines: "└" in lines[-1])
                pane.tmux("send-keys", "-l", " " * 760)
                pane.wait_for(lambda lines: lines[-2:] == ["│" + " " * 69 + "█", "└"])
                pane.tmux("send-keys", "Enter")
                pane.wait_for(lambda lines: any(line.startswith("└  Enter a title") for line in lines[-2:]))
                pane.tmux("send-keys", "Up")
                time.sleep(.3)
                worker = pane.job()
                os.killpg(os.getpgid(worker), signal.SIGTSTP)
                pane.wait_stopped(worker)
                lines = pane.wait_for(lambda lines: any("Stopped" in line for line in lines), history=True)
                notice = next(index for index, line in enumerate(lines) if "Stopped" in line)
                # The cursor stayed at the end of the question, so the shell wrote its notice below the last row of it.
                last = max(index for index, line in enumerate(lines) if line.startswith("└"))
                self.assertLess(last, notice, lines)
                self.assertTrue(any(line.endswith("█") for line in lines[:last]), lines)
                pane.go.touch()
                pane.wait_for(lambda lines: "T" not in state(worker) and lines[-1].startswith("└") and lines[-2].endswith("█"))
                pane.tmux("send-keys", "C-c")
                pane.wait_for(lambda lines: "└  Creation canceled." in lines)
            finally:
                pane.close()

    def test_terminal_closed_or_quit_during_install(self):
        # A person in an interactive bash closes the terminal during the install or at a question, or presses Ctrl+\ under a
        # launcher that dies on SIGQUIT as npx does. Closed during the install, the installer ends a cleanup longer than the
        # window of a repeated signal and the CLI ends as a cancel, with nothing on its stderr. At a question only the code of
        # a cancel is checked. The signals that reach the CLI and the installer, its stderr and the screen are printed.
        self.assertIsNotNone(shutil.which("tmux"), "The tmux tests of the questionnaire harness need tmux: install it and run again")
        self.assertIsNotNone(bash_path(), "The tmux tests of the questionnaire harness need bash: install it and run again")
        versions = [subprocess.run(command, capture_output=True, text=True).stdout.split("\n")[0]
                    for command in ([bash_path(), "--version"], ["tmux", "-V"])]
        cleanup_ms = 1500
        for case in ("hangup", "question", "quit"):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as directory:
                if case == "quit" and not sys.platform.startswith("linux"):
                    # On macOS every process that SIGQUIT ends leaves a crash report.
                    self.skipTest("Ctrl+\\ runs only on Linux")
                root = pathlib.Path(directory)
                (root / "installer.js").write_text(CLEANING_INSTALLER)
                installer = root / "bun"
                installer.write_text(f"#!/bin/sh\nexec {shlex.quote(node)} {shlex.quote(str(root / 'installer.js'))}\n")
                installer.chmod(0o755)
                (root / "entry.mjs").write_text(EXIT_ENTRY)
                signals, cleaned, cli_signals = root / "installer.signals", root / "cleaned", root / "cli.signals"
                cli_stderr, cli_children, cli_input = root / "cli.stderr", root / "cli.children", root / "cli.input"
                socket = str(root / "tmux.sock")
                # Discard Bash history so shell exit cannot recreate a file during fixture cleanup.
                tmux_env = {key: os.environ[key] for key in ("HOME", "LANG", "TMPDIR") if key in os.environ} | {
                    "SHELL": "/bin/sh", "PATH": f"{root}:{os.environ['PATH']}", "PS1": "$ ", "HISTFILE": os.devnull,
                    "BASH_SILENCE_DEPRECATION_WARNING": "1", "NODE": node, "ENTRY": str(root / "entry.mjs"),
                    "LAUNCHER": DYING_LAUNCHER, "PID_FILE": str(root / "installer.pid"), "SIGNALS": str(signals),
                    "CLEANING": str(root / "cleaning"), "CLEANED": str(cleaned), "CLEANUP_MS": str(cleanup_ms),
                    "EXIT_FILE": str(root / "cli.exit"), "CLI_URL": cli.as_uri(), "CLI_STDERR": str(cli_stderr),
                    **({"CLI_SIGNALS": str(cli_signals)} if case != "quit" else {}),
                    **({"CLI_CHILDREN": str(cli_children)} if case == "hangup" else {}),
                    **({"CLI_INPUT": str(cli_input)} if case == "question" else {})}
                def tmux(*args, check=True):
                    return subprocess.run(["tmux", "-f", "/dev/null", "-S", socket, *args], env=tmux_env, text=True,
                                          capture_output=True, timeout=5, check=check).stdout
                def capture():
                    return tmux("capture-pane", "-p", "-S", "-200").rstrip("\n").split("\n")
                def wait_for(check):
                    deadline = time.monotonic() + 10
                    while time.monotonic() < deadline:
                        lines = capture()
                        if check(lines):
                            return lines
                        time.sleep(.04)
                    self.fail(capture())
                def alive(process):
                    try:
                        os.kill(process, 0)
                    except ProcessLookupError:
                        return False
                    # A process that ended and that nobody has reaped yet is gone too.
                    status = subprocess.run(["ps", "-o", "stat=", "-p", str(process)], capture_output=True, text=True)
                    return "Z" not in status.stdout
                started = []
                tmux("new-session", "-d", "-x", "80", "-y", "60", "-c", directory, bash_path(), "--norc", "--noprofile", "-i")
                try:
                    shell = int(tmux("display", "-p", "#{pane_pid}"))
                    wait_for(lambda lines: lines[-1] == "$")
                    launcher = '"$NODE" -e "$LAUNCHER" ' if case == "quit" else ""
                    # The terminal is gone by the time the CLI writes an error, so stderr goes to a file.
                    errors = ' 2> "$CLI_STDERR"' if case != "quit" else ""
                    tmux("send-keys", "-l", f'env CI=false NO_COLOR=1 TERM=xterm {launcher}"$NODE" "$ENTRY" app --lang en '
                                            f"--mode server --no-git --install{errors}")
                    tmux("send-keys", "Enter")
                    labels = ("Application title",) if case == "question" else ("Application title", "Setup", "Create the project?")
                    for label in labels:
                        wait_for(lambda lines: any(label in line for line in lines))
                        if case != "question":
                            tmux("send-keys", "Enter")
                    worker = None
                    if case != "question":
                        wait_for(lambda lines: any("Installing dependencies with Bun" in line for line in lines))
                        worker = recorded(root / "installer.pid")
                        self.assertIsNotNone(worker)
                    [job] = children(shell)
                    leader = children(job)[0] if case == "quit" else job
                    started = [process for process in (job, leader, worker) if process]
                    tty = tmux("display", "-p", "#{pane_tty}").strip().removeprefix("/dev/")
                    table = system_tool("ps", "-o", "pid,ppid,pgid,tpgid,stat,args", "-t", tty)
                    if case != "quit":
                        closed = time.time()
                        tmux("kill-pane")
                        deadline = time.monotonic() + 5
                        ended = None
                        while alive(leader) or (worker and alive(worker)):
                            self.assertLess(time.monotonic(), deadline, table)
                            if ended is None and not (worker and alive(worker)):
                                ended = time.time()
                            time.sleep(.005)
                        ended = ended or time.time()
                        # The pane is gone, and with it the only session of this server.
                        self.assertNotEqual(subprocess.run(["tmux", "-S", socket, "list-panes"], env=tmux_env,
                                                           capture_output=True).returncode, 0)
                        def times(file):
                            lines = file.read_text().splitlines() if file.exists() else []
                            return [[*fields[:-1], round(float(fields[-1]) - closed * 1000, 1)] for fields in map(str.split, lines)]
                        cli_exit = recorded(root / "cli.exit") if (root / "cli.exit").exists() else None
                        written = cli_stderr.read_text() if cli_stderr.exists() else ""
                        place = "at a question" if case == "question" else "during the install"
                        print(f"Measured, the terminal closed {place}:", json.dumps({
                            "system": sys.platform, "bash": versions[0], "tmux": versions[1],
                            "cli_signals_ms": times(cli_signals), "cli_exit": cli_exit, "cli_stderr": written.splitlines(),
                            **({"cli_input_ms": times(cli_input)} if case == "question" else {}),
                            **({"cleanup_ms": cleanup_ms, "installer_signals_ms": times(signals),
                                "cli_to_installer_ms": times(cli_children),
                                "cleanup_ended_ms": round(float(cleaned.read_text()) - closed * 1000, 1) if cleaned.exists() else None,
                                "installer_gone_ms": round((ended - closed) * 1000, 1)} if worker else {}),
                            "processes": table.splitlines()}), flush=True)
                        if case == "question":
                            self.assertEqual(cli_exit, 130, written)
                        else:
                            self.assertTrue(cleaned.exists(), written)
                            self.assertEqual((cli_exit, written), (130, ""))
                    else:
                        group = os.getpgid(job)
                        names = [system_tool("ps", "-o", "comm=", "-p", member).strip()
                                 for member in system_tool("pgrep", "-g", str(group)).split()]
                        # SIGQUIT goes to the foreground group, which must hold no Python process.
                        self.assertFalse([name for name in names if "python" in name.lower()], names)
                        lines = capture()
                        row = max(index for index, line in enumerate(lines) if "Installing dependencies with Bun" in line)
                        tmux("send-keys", "-H", "1c")
                        deadline = time.monotonic() + 5
                        while alive(job) or alive(leader) or alive(worker):
                            self.assertLess(time.monotonic(), deadline, table)
                            time.sleep(.01)
                        # The shell has the terminal back and has written its prompt, on the row of the indicator or below.
                        lines = wait_for(lambda lines: system_tool("ps", "-o", "tpgid=", "-p", str(shell)).strip() == str(shell)
                                         and any(line.startswith("$") for line in lines[row:]))
                        print("Measured, Ctrl+\\ under a launcher that dies on SIGQUIT:", json.dumps({
                            "system": sys.platform, "bash": versions[0], "tmux": versions[1], "indicator_row": lines[row],
                            "below": lines[row + 1:], "group": names, "processes": table.splitlines()}), flush=True)
                finally:
                    tmux("kill-server", check=False)
                    for target in started:
                        try:
                            if os.getsid(target) == shell:
                                os.kill(target, signal.SIGKILL)
                        except ProcessLookupError:
                            pass

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


if __name__ == "__main__":
    unittest.main()
