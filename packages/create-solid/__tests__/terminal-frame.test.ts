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
  assert.match(redirected, /done/u)
})

void it('reserves echo space in a single column and clips only the Git warning title', () => {
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
    '\r\u001B[J◇\n▲  Git repo…\n│  denied by\n│  configur\n│  ation\n'
  )
})

void it('wraps the installer tail and long resume path inside the guide', () => {
  const reason =
    'registry rejected the installation\n\nYour project is in parent/a-directory-name-that-needs-wrapping. To finish, run:'
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
    '│  Your project is in pa',
    '│  rent/a-directory-name',
    '│  -that-needs-wrapping.',
    '│  To finish, run:',
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
  reflow: boolean
}
function resizeScreen({ bytes, initial, target, reflow }: Resize) {
  let width = initial
  let rows = ['']
  let row = 0
  let column = 0
  let autoWrap = true
  // The transcript contains literal terminal control sequences.
  const tokens =
    // oxlint-disable-next-line no-control-regex
    bytes.match(/\u001B\[(?:2K|1A|J|\?(?:7|25)[hl])|[\s\S]/gu) ?? []
  for (const token of tokens) {
    if (token === '\f') {
      // Only the active logical line can exceed either window width at this point.
      const line = rows[row] ?? ''
      width = target
      if (reflow) {
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
    } else if (token === '\r') column = 0
    else if (token === '\n') {
      row += 1
      column = 0
    } else if (token === '\u001B[1A') row = Math.max(0, row - 1)
    else if (token === '\u001B[2K') rows[row] = ''
    else if (token === '\u001B[J') {
      rows = [...rows.slice(0, row), (rows[row] ?? '').slice(0, column)]
    } else if (token.startsWith('\u001B[?7')) autoWrap = token.endsWith('h')
    else if (!token.startsWith('\u001B')) {
      if (column === width) {
        if (autoWrap) row += 1
        column = autoWrap ? 0 : width - 1
      }
      const line = rows[row] ?? ''
      rows[row] = line.slice(0, column) + token + line.slice(column + 1)
      column += 1
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
      reflow: order !== 'truncate'
    })
    const end = rows.findIndex(line => line.startsWith('■'))
    assert.deepEqual(rows.slice(0, end), [
      '◇  Files created',
      '◇  Git repository created'
    ])
    assert.ok(end !== -1)
  })
}
