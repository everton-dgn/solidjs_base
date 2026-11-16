import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createRunner, TIMED_OUT_EXIT_CODE } from '../runner.ts'

const ENOUGH_TIME = 60_000
// Shorter than the start of any Node process.
const TOO_SHORT = 1

describe('mergePullRequest runner', () => {
  it('returns the output of a command that succeeds', async () => {
    const result = await createRunner(ENOUGH_TIME)({
      file: 'npm',
      args: ['--version'],
      isWrite: false
    })

    assert.equal(result.exitCode, 0)
    assert.match(result.stdout, /^\d+\.\d+\.\d+/u)
  })

  it('returns the exit code of a command that fails', async () => {
    const result = await createRunner(ENOUGH_TIME)({
      file: 'npm',
      args: ['not-a-command'],
      isWrite: false
    })

    assert.notEqual(result.exitCode, 0)
  })

  it('stops a command that does not finish in time and says so', async () => {
    const result = await createRunner(TOO_SHORT)({
      file: 'npm',
      args: ['--version'],
      isWrite: false
    })

    assert.notEqual(result.exitCode, 0)
    assert.match(
      result.stderr,
      /^npm --version did not finish within .+ and was stopped\.$/u
    )
  })

  it('stops a command at its own timeout when it is shorter than the one of the runner', async () => {
    const result = await createRunner(ENOUGH_TIME)({
      file: 'npm',
      args: ['--version'],
      isWrite: false,
      timeout: TOO_SHORT
    })

    assert.equal(result.exitCode, TIMED_OUT_EXIT_CODE)
    assert.equal(
      result.stderr,
      'npm --version did not finish within 1 millisecond(s) and was stopped.'
    )
  })
})
