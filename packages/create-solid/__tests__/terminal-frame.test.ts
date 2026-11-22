import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import process from 'node:process'
import { it } from 'node:test'

type Terminal = { isTTY: boolean; term: string; shouldDrawStatuses?: boolean }
function draw({ isTTY, term, shouldDrawStatuses = false }: Terminal): string {
  const script = `
    Object.defineProperty(process.stdout, 'isTTY', {value: ${isTTY}})
    const { progress, closeFrame } = await import('./src/terminal-frame.ts')
    progress.start('files')
    progress.finish('done')
    if (${shouldDrawStatuses}) {
    progress.start('git')
    progress.warn('warning')
    progress.start('install')
    progress.cancel()
    progress.start('files')
    progress.error('error')
    closeFrame({ reason: 'reason', closing: 'end' })
    }
  `
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '', FORCE_COLOR: '1', TERM: term }
  })
}
void it('draws the Clack status colors and indicator for each terminal', () => {
  const steps = draw({ isTTY: true, term: 'xterm' })
  assert.ok(steps.includes('\u001B[32m◇'), JSON.stringify(steps))
  const output = draw({ isTTY: true, term: 'xterm', shouldDrawStatuses: true })
  for (const colored of [
    '\u001B[35m◒',
    '\u001B[32m◇',
    '\u001B[33m▲',
    '\u001B[31m■',
    '\u001B[31m▲',
    '\u001B[90m│\u001B[39m  reason'
  ]) {
    assert.ok(output.includes(colored), JSON.stringify(output))
  }
  assert.ok(draw({ isTTY: true, term: 'linux' }).includes('\u001B[35m•'))
  const redirected = draw({ isTTY: false, term: 'xterm' })
  assert.doesNotMatch(redirected, /\r/u)
  assert.ok(!redirected.includes('\u001B[?25'))
  assert.match(redirected, /done/u)
})

void it('draws the indicator in a single column and clips only the Git warning title', () => {
  const script = `
    Object.defineProperty(process.stdout, 'isTTY', {value: true})
    Object.defineProperty(process.stdout, 'columns', {value: 1, configurable: true})
    const { progress } = await import('./src/terminal-frame.ts')
    progress.start('files')
    progress.finish('done')
    Object.defineProperty(process.stdout, 'columns', {value: 12})
    progress.warn('Git repository not created\\ndenied by configuration')
  `
  const output = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      encoding: 'utf8',
      env: { ...process.env, FORCE_COLOR: '0', TERM: 'xterm' }
    }
  )
  assert.equal(
    output,
    '\u001B[?25l\r\u001B[?7l◒\u001B[?7h\r\r\u001B[J\u001B[?25h◇\n▲  Git repo…\n│  denied by\n│  configur\n│  ation\n'
  )
})

void it('wraps the installer tail and long resume path inside the guide', () => {
  const reason =
    'registry rejected the installation\n\nYour project is in parent/a-directory-name-that-needs-wrapping. To finish, run:\ncd parent/a-directory-name-that-needs-wrapping'
  const script = `
    Object.defineProperty(process.stdout, 'columns', {value: 24})
    const { closeFrame } = await import('./src/terminal-frame.ts')
    closeFrame({ reason: ${JSON.stringify(reason)}, closing: 'end' })
  `
  const output = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      encoding: 'utf8',
      env: { ...process.env, FORCE_COLOR: '0', TERM: 'xterm' }
    }
  )
  assert.deepEqual(output.trimEnd().split('\n'), [
    '│  registry rejected the',
    '│  installation',
    '│',
    '│  Your project is in:',
    '│  parent/a-directory-name-that-needs-wrapping',
    '│  To finish, run:',
    '│  cd parent/a-directory-name-that-needs-wrapping',
    '│',
    '└  end'
  ])
})

void it('uses ASCII dots when clipping an ASCII step', () => {
  const script = `
    Object.defineProperty(process.stdout, 'columns', {value: 12})
    const { progress } = await import('./src/terminal-frame.ts')
    progress.finish('Dependencies installed')
  `
  const output = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      encoding: 'utf8',
      env: { ...process.env, FORCE_COLOR: '0', TERM: 'linux' }
    }
  )
  assert.match(output, / {2}Depend\.\.\.\n$/u)
})

void it('uses the Clack interval for each indicator', () => {
  const script = `
    Object.defineProperty(process.stdout, 'isTTY', {value: true})
    globalThis.setInterval = (_, ms) => { process.stderr.write(String(ms)); return undefined }
    const { progress } = await import('./src/terminal-frame.ts')
    progress.start('files')
  `
  for (const [term, interval] of [
    ['xterm', '80'],
    ['linux', '120']
  ] as const) {
    const child = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', script],
      {
        encoding: 'utf8',
        env: { ...process.env, TERM: term }
      }
    )
    assert.equal(child.status, 0, child.stderr)
    assert.equal(child.stderr, interval)
  }
})

void it('aligns wrapped next steps with the note text', () => {
  const script = `
    Object.defineProperty(process.stdout, 'columns', {value: 40})
    const { finishProject } = await import('./src/terminal-frame.ts')
    const { messages } = await import('./src/cli-language.ts')
    finishProject({ steps: [messages.en.setUrl], language: 'en' })
  `
  const output = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      encoding: 'utf8',
      env: { ...process.env, FORCE_COLOR: '0', TERM: 'xterm' }
    }
  )
  assert.match(output, /^│ {2}your site URL before publishing\. +│$/mu)
})

void it('keeps commands on one frame line for resuming and starting', () => {
  const commands = [
    'cd a-directory-name-longer-than-the-terminal',
    'git init',
    'pnpm install',
    'bun run dev'
  ]
  const script = `
    Object.defineProperty(process.stdout, 'columns', {value: 10})
    const { finishProject, closeFrame } = await import('./src/terminal-frame.ts')
    const steps = ${JSON.stringify(commands)}
    closeFrame({reason: steps.join('\\n'), closing: 'end'})
    finishProject({steps, language: 'en'})
  `
  const output = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      encoding: 'utf8',
      env: { ...process.env, FORCE_COLOR: '0', TERM: 'xterm' }
    }
  )
  const lines = output.split('\n')
  const expectedOccurrences = 2
  for (const command of commands) {
    assert.equal(
      lines.filter(line => line === `│  ${command}`).length,
      expectedOccurrences,
      output
    )
  }
})

type Resize = {
  bytes: string
  initial: number
  target: number
  shouldReflow: boolean
}
function resizeScreen({ bytes, initial, target, shouldReflow }: Resize) {
  let width = initial
  let rows = ['']
  let row = 0
  let column = 0
  let isAutoWrapOn = true
  // The transcript contains literal terminal control sequences.
  const tokens =
    // oxlint-disable-next-line no-control-regex
    bytes.match(/\u001B\[(?:2K|1A|J|\?(?:7|25)[hl])|[\s\S]/gu) ?? []
  for (const token of tokens) {
    switch (token) {
      case '\f': {
        // Only the active logical line can exceed either window width at this point.
        const line = rows[row] ?? ''
        width = target
        if (shouldReflow) {
          const parts = []
          for (let start = 0; start < line.length; start += width) {
            parts.push(line.slice(start, start + width))
          }
          rows.splice(row, 1, ...parts)
          row += Math.floor(column / width)
          column %= width
        } else {
          rows[row] = line.slice(0, width)
          column = Math.min(column, width - 1)
        }
        break
      }
      case '\r': {
        column = 0
        break
      }
      case '\n': {
        row += 1
        column = 0
        break
      }
      case '\u001B[1A': {
        row = Math.max(0, row - 1)
        break
      }
      case '\u001B[2K': {
        rows[row] = ''
        break
      }
      case '\u001B[J': {
        rows = [...rows.slice(0, row), (rows[row] ?? '').slice(0, column)]
        break
      }
      case '\u001B[?7h': {
        isAutoWrapOn = true
        break
      }
      case '\u001B[?7l': {
        isAutoWrapOn = false
        break
      }
      default: {
        if (token.startsWith('\u001B')) break
        if (column === width) {
          if (isAutoWrapOn) row += 1
          column = isAutoWrapOn ? 0 : width - 1
        }
        const line = rows[row] ?? ''
        rows[row] = line.slice(0, column) + token + line.slice(column + 1)
        column += 1
      }
    }
  }
  return rows
}

for (const order of ['FWC', 'FTWC', 'FTTWC', 'FC', 'FTC', 'grow', 'truncate']) {
  void it(`preserves the completed steps on resize: ${order}`, () => {
    const narrow = 30
    const wide = 80
    const initial = order === 'grow' ? narrow : wide
    const target = order === 'grow' ? wide : narrow
    const events = order === 'grow' || order === 'truncate' ? 'FWC' : order
    const script = `
      Object.defineProperty(process.stdout,'isTTY',{value:true})
      const width = value => Object.defineProperty(process.stdout,'columns',{value,configurable:true})
      width(${initial})
      let tick
      globalThis.setInterval = callback => { tick = callback; return 1 }
      const {progress} = await import('./src/terminal-frame.ts')
      for (const title of ['Files created','Git repository created']) {
        progress.start(title)
        progress.finish(title)
      }
      progress.start('Installing dependencies with Bun')
      for (const event of '${events}') {
        if (event === 'F') process.stdout.write('\\f')
        if (event === 'T') tick()
        if (event === 'W') { width(${target}); process.stdout.emit('resize') }
        if (event === 'C') progress.cancel()
      }
    `
    const bytes = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', script],
      {
        encoding: 'utf8',
        env: { ...process.env, TERM: 'xterm', FORCE_COLOR: '0' }
      }
    )
    const rows = resizeScreen({
      bytes,
      initial,
      target,
      shouldReflow: order !== 'truncate'
    })
    const end = rows.findIndex(line => line.startsWith('■'))
    assert.deepEqual(rows.slice(0, end), [
      '◇  Files created',
      '◇  Git repository created'
    ])
    assert.ok(end !== -1)
  })
}

void it('restores the cursor when exiting during a step', () => {
  const bytes = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    Object.defineProperty(process.stdout,'isTTY',{value:true})
    const {progress} = await import('./src/terminal-frame.ts')
    progress.start('install')
    process.exit(0)
  `
    ],
    { encoding: 'utf8' }
  )
  assert.ok(bytes.includes('\u001B[?25l'))
  assert.ok(bytes.endsWith('\u001B[?25h'))
})

for (const [first, last] of [
  ['Your project is in', 'To finish, run:'],
  ['Seu projeto está em', 'Para concluir, execute:'],
  ['Tu proyecto está en', 'Para terminar, ejecuta:']
] as const) {
  void it(`preserves long resume directories: ${first}`, () => {
    const dir =
      'parent/a-long-directory-name-that-will-not-fit-on-one-terminal-line/app'
    const reason = `${first} ${dir}. ${last}\ncd ${dir}`
    const bytes = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      Object.defineProperty(process.stdout,'columns',{value:40})
      const {closeFrame} = await import('./src/terminal-frame.ts')
      closeFrame({reason:${JSON.stringify(reason)},closing:'end'})
    `
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, TERM: 'xterm', FORCE_COLOR: '0' }
      }
    )
    assert.deepEqual(bytes.trimEnd().split('\n'), [
      `│  ${first}:`,
      `│  ${dir}`,
      `│  ${last}`,
      `│  cd ${dir}`,
      '│',
      '└  end'
    ])
  })
}
void it('keeps an occupied destination whole and wraps other errors normally', () => {
  const dir =
    '/parent/a-long-directory-name-that-will-not-fit-on-one-terminal-line/app'
  const bytes = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    Object.defineProperty(process.stdout,'columns',{value:40})
    const {stopFrame} = await import('./src/terminal-frame.ts')
    const occupiedDir = ${JSON.stringify(dir)}
    stopFrame({reason:{text:'La carpeta del proyecto debe ser nueva o estar vacía: '+occupiedDir,occupiedDir},closing:'Creación interrumpida.'})
    stopFrame({reason:'Error: '+occupiedDir,closing:'end'})
  `
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, TERM: 'xterm', FORCE_COLOR: '0' }
    }
  )
  assert.deepEqual(bytes.trimEnd().split('\n'), [
    '▲  La carpeta del proyecto debe ser',
    '│  nueva o estar vacía:',
    `│  ${dir}`,
    '│',
    '└  Creación interrumpida.',
    '',
    '▲  Error:',
    '│  /parent/a-long-directory-name-that-wi',
    '│  ll-not-fit-on-one-terminal-line/app',
    '│',
    '└  end'
  ])
})

void it('closes each step at the new PTY width before resize is dispatched', () => {
  const title = 'Installing dependencies with Bun'
  const script = `
    import { readSync } from 'node:fs'
    import { progress, closeFrame } from './src/terminal-frame.ts'
    progress.start('${title}')
    process.stderr.write('ready\\n')
    readSync(Number(process.env.SYNC_FD), Buffer.alloc(1), 0, 1, null)
    process.stdout.write('\\f')
    progress.cancel()
    progress.error('${title}')
    progress.warn('${title}\\nThis diagnostic spans several words and several lines.')
    progress.finish('${title}')
    closeFrame({reason:'This explanation must wrap within the smaller terminal.',closing:'end'})
    if (process.stdout.columns !== 80) process.exitCode = 1
  `
  const harness = `
import os, pty, select, struct, subprocess, sys, termios, fcntl
master, slave = pty.openpty()
reader, writer = os.pipe()
def resize(columns):
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, columns, 0, 0))
try:
    resize(80)
    with subprocess.Popen(sys.argv[1:], pass_fds=(reader,), env=dict(os.environ, SYNC_FD=str(reader)), stdout=slave, stderr=subprocess.PIPE) as cli:
        try:
            assert select.select([cli.stderr], [], [], 5)[0]
            assert cli.stderr.readline() == b'ready\\n'
            resize(30)
            os.write(writer, b'x')
            _, errors = cli.communicate(timeout=5)
            assert cli.returncode == 0, errors
            while select.select([master], [], [], 0)[0]:
                sys.stdout.buffer.write(os.read(master, 65536))
        finally:
            if cli.poll() is None:
                cli.kill()
finally:
    os.close(master)
    os.close(slave)
    os.close(reader)
    os.close(writer)
  `
  const bytes = execFileSync(
    'python3',
    ['-c', harness, process.execPath, '--input-type=module', '-e', script],
    {
      encoding: 'utf8',
      env: { ...process.env, TERM: 'xterm', FORCE_COLOR: '0' }
    }
  )
  const target = 30
  const rows = resizeScreen({ bytes, initial: 80, target, shouldReflow: true })
  for (const mark of ['■', '▲', '◇']) {
    assert.ok(
      rows.includes(`${mark}  Installing dependencies wi…`),
      rows.join('\n')
    )
  }
  const closing = bytes.slice(bytes.indexOf('\f') + 1)
  // oxlint-disable-next-line no-control-regex
  const plain = closing.replaceAll(/\u001B\[[0-9;?]*[A-Za-z]/gu, '')
  for (const row of plain.split(/\r?\n/u)) {
    assert.ok(row.trim().length <= target, row)
  }
})

void it('keeps an occupied path between its surrounding sentences', () => {
  const dir = '/a/directory/that/will/not/fit/within/40/columns'
  const bytes = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    Object.defineProperty(process.stdout, 'columns', {value:40})
    const { stopFrame } = await import('./src/terminal-frame.ts')
    const occupiedDir = ${JSON.stringify(dir)}
    const { message } = await import('./src/cli-language.ts')
    stopFrame({reason:{text:'Before the path: '+occupiedDir+' Continue here.',occupiedDir},closing:'end'})
    stopFrame({reason:{text:'Before the path: '+occupiedDir+'.',occupiedDir},closing:'end'})
    for (const language of ['en','pt-BR','es']) {
      const text = message(language,{code:'occupied',values:{dir:occupiedDir}})
      stopFrame({reason:{text,occupiedDir},closing:'end'})
    }
    stopFrame({reason:{text:'No matching directory here.',occupiedDir},closing:'end'})
  `
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, TERM: 'xterm', FORCE_COLOR: '0' }
    }
  )
  assert.deepEqual(
    bytes
      .trimEnd()
      .split('\n\n')
      .map(frame => frame.split('\n')),
    [
      ['▲  Before the path:', `│  ${dir}`, '│  Continue here.', '│', '└  end'],
      ['▲  Before the path:', `│  ${dir}.`, '│', '└  end'],
      [
        '▲  The project directory must be new or',
        '│  empty:',
        `│  ${dir}`,
        '│',
        '└  end'
      ],
      [
        '▲  A pasta do projeto precisa ser nova',
        '│  ou estar vazia:',
        `│  ${dir}`,
        '│',
        '└  end'
      ],
      [
        '▲  La carpeta del proyecto debe ser',
        '│  nueva o estar vacía:',
        `│  ${dir}`,
        '│',
        '└  end'
      ],
      ['▲  No matching directory here.', '│', '└  end']
    ]
  )
})

void it('closes steps at the cached width when the terminal probe fails', () => {
  const script = `
    import tty from 'node:tty'
    import { syncBuiltinESMExports } from 'node:module'
    import assert from 'node:assert/strict'
    Object.defineProperties(process.stdout, {
      columns: { value: 12 },
      isTTY: { value: true }
    })
    tty.isatty = () => true
    let mode
    let destroyed = 0
    tty.WriteStream = class {
      constructor() { if (mode === 'constructor') throw Error(mode) }
      getWindowSize() {
        if (mode === 'read') throw Error(mode)
        return [mode]
      }
      destroy() { destroyed++ }
    }
    syncBuiltinESMExports()
    const { progress } = await import('./src/terminal-frame.ts')
    for (mode of ['constructor', 'read', undefined, 0, 2.5]) {
      progress.start('files')
      progress.finish('Dependencies installed')
    }
    assert.equal(destroyed, 4)
  `
  const bytes = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      encoding: 'utf8',
      env: { ...process.env, TERM: 'xterm', FORCE_COLOR: '0' }
    }
  )
  assert.deepEqual(
    bytes
      .split('\n')
      .slice(0, -1)
      .map(line => line.slice(line.lastIndexOf('◇'))),
    Array.from({ length: 5 }, () => '◇  Dependen…')
  )
})
