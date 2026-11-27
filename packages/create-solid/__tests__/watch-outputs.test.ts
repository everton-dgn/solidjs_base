import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { it } from 'node:test'

const childTimeoutMs = 10_000

for (const name of ['stdout', 'stderr'] as const) {
  void it(`preserves the first fatal error after a tolerated error on ${name}`, () => {
    const alternate = name === 'stdout' ? 'stderr' : 'stdout'
    const directory = mkdtempSync(path.join(tmpdir(), 'solid-output-'))
    const trace = path.join(directory, 'trace')
    try {
      const script = `
        import { writeFileSync } from 'node:fs'
        import { watchOutputs } from './src/watchOutputs/index.ts'
        const first = process.${name}
        const other = process.${alternate}
        const errors = watchOutputs()
        const failure = code => Object.assign(new Error(code), { code })
        let aborts = 0
        errors.signal.addEventListener('abort', () => { aborts += 1 })
        first.emit('error', failure('EPIPE'))
        const wasAborted = errors.signal.aborted
        const wasAvailable = errors.canWrite(first)
        const fatal = failure('ENOSPC')
        first.emit('error', fatal)
        first.emit('error', failure('EIO'))
        const attempts = []
        other.write = chunk => {
          attempts.push(chunk)
          other.emit('error', failure('EIO'))
          return false
        }
        errors.report({ language: 'en', resume: '' })
        errors.report({ language: 'en', resume: '' })
        writeFileSync(process.env.OUTPUT_TRACE, JSON.stringify({
          wasAborted, wasAvailable, aborts, keptFirst: errors.signal.reason === fatal,
          otherAvailable: errors.canWrite(other), attempts
        }))
      `
      const child = spawnSync(
        process.execPath,
        ['--input-type=module', '-e', script],
        {
          encoding: 'utf8',
          env: { ...process.env, OUTPUT_TRACE: trace },
          timeout: childTimeoutMs
        }
      )
      assert.equal(child.status, 1, child.stderr)
      const output = name === 'stdout' ? 'output' : 'error'
      assert.deepEqual(JSON.parse(readFileSync(trace, 'utf8')), {
        wasAborted: false,
        wasAvailable: false,
        aborts: 1,
        keptFirst: true,
        otherAvailable: false,
        attempts: [`Could not write to the standard ${output}: ENOSPC.\n`]
      })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
}
