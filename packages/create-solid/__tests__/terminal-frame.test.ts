import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { it } from 'node:test'

type Terminal = { isTTY: boolean; term: string; statuses?: boolean }
function draw({ isTTY, term, statuses = false }: Terminal): string {
  const script = `
    Object.defineProperty(process.stdout, 'isTTY', {value: ${isTTY}})
    const { progress, closeFrame } = await import('./src/terminal-frame.ts')
    progress.start('files')
    progress.finish('done')
    if (${statuses}) {
    progress.start('git')
    progress.warn('warning')
    progress.start('install')
    progress.cancel()
    progress.start('files')
    progress.error('error')
    closeFrame('reason', 'end')
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
  const output = draw({ isTTY: true, term: 'xterm', statuses: true })
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
    '\r\u001B[2K◇\n▲  Git repo…\n│  denied by\n│  configur\n│  ation\n'
  )
})

void it('wraps the installer tail and long resume path inside the guide', () => {
  const reason =
    'registry rejected the installation\n\nYour project is in parent/a-directory-name-that-needs-wrapping. To finish, run:'
  const script = `
    Object.defineProperty(process.stdout, 'columns', {value: 24})
    const { closeFrame } = await import('./src/terminal-frame.ts')
    closeFrame(${JSON.stringify(reason)}, 'end')
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
