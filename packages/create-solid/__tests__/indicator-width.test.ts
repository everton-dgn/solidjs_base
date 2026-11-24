import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { it } from 'node:test'

void it('draws the indicator at the width of the terminal after a continue, also when the size went back before Node read it', () => {
  const script = `
    import nodeTimers from 'node:timers'
    import tty from 'node:tty'
    import { syncBuiltinESMExports } from 'node:module'
    Object.defineProperty(process.stdout, 'isTTY', { value: true })
    Object.defineProperty(process.stdout, 'columns', { value: 80, writable: true })
    let real = 80
    tty.isatty = () => true
    tty.WriteStream = class { getWindowSize() { return [real, 24] } destroy() {} }
    let tick
    nodeTimers.setInterval = callback => { tick = callback; return 1 }
    nodeTimers.clearInterval = () => {}
    syncBuiltinESMExports()
    process.kill = () => true
    const writes = []
    const write = process.stdout.write.bind(process.stdout)
    process.stdout.write = (chunk, ...rest) => { writes.push(String(chunk)); return write(chunk, ...rest) }
    const turn = () => new Promise(resolve => setImmediate(resolve))
    const { progress } = await import('./src/terminal-frame.ts')
    const seen = {}
    for (const isBack of [true, false]) {
      progress.start('Installing dependencies with Bun')
      // The terminal is made narrower while the CLI is stopped, and Node holds the size from before the stop.
      real = 30
      process.emit('SIGTSTP')
      await turn()
      const continued = writes.length
      if (isBack) real = 80
      // Node reads the size in its own SIGWINCH listener, and reports a resize only when the size it holds changed.
      if (process.stdout.columns !== real) { process.stdout.columns = real; process.stdout.emit('resize') }
      process.emit('SIGWINCH')
      tick()
      await turn()
      const after = writes.slice(continued)
      const last = after.filter(chunk => chunk.includes('Installing')).at(-1)
      const clears = after.filter(chunk => chunk === '\\r\\u001B[J').length
      seen[isBack ? 'back' : 'narrower'] = { clears, last: last.replaceAll(/\\u001B\\[[\\d;?]*[a-z]|\\r/gu, '') }
      progress.clear()
    }
    process.stderr.write(JSON.stringify(seen))
  `
  const { stderr } = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    { encoding: 'utf8', env: { ...process.env, TERM: 'xterm', NO_COLOR: '1' } }
  )
  // The continue has drawn at the size of the terminal once; only a size Node did not report as a resize draws again.
  assert.deepEqual(JSON.parse(stderr), {
    back: { clears: 1, last: '◑  Installing dependencies with Bun' },
    narrower: { clears: 0, last: '◓  Installing dependencies wi…' }
  })
})
