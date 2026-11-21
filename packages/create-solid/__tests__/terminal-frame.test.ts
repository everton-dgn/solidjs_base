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

void it('redraws in a single column and clips only the Git warning title', () => {
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
    '\r◒\r\u001B[2K◇\n▲  Git repo…\n│  denied by configuration\n'
  )
})
