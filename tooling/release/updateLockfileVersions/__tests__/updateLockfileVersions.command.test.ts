import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { execPath } from 'node:process'
import { describe, it, type TestContext } from 'node:test'
import { promisify } from 'node:util'

import { makeFolder } from './fixtures.ts'

type CommandRun = { context: TestContext; generated: string }

type CommandOutcome = { exitCode: unknown; stdout: string; stderr: string }

type ExitFailure = { code: unknown; stdout: string; stderr: string }

type LockState = { text: string; modified: number }

const execute = promisify(execFile)

const COMMAND = path.resolve(
  import.meta.dirname,
  '../../update-lockfile-versions.ts'
)
// WHY: the command checks the bun.lock of the tree it belongs to, which is the
// lock of this repository. Each case writes nothing, and the tests check that
// the lock stays as it was.
const LOCKFILE = path.resolve(import.meta.dirname, '../../../../bun.lock')
const PROCESS_TIMEOUT = 30_000

// execFile rejects when the command exits with a code other than zero.
function isExitFailure(error: unknown): error is ExitFailure {
  return (
    error instanceof Error &&
    'code' in error &&
    'stdout' in error &&
    typeof error.stdout === 'string' &&
    'stderr' in error &&
    typeof error.stderr === 'string'
  )
}

async function readLockState(): Promise<LockState> {
  const [text, stats] = await Promise.all([
    readFile(LOCKFILE, 'utf8'),
    stat(LOCKFILE)
  ])
  return { text, modified: stats.mtimeMs }
}

async function runCommand({
  context,
  generated
}: CommandRun): Promise<CommandOutcome> {
  const file = path.join(await makeFolder(context), 'bun.lock')
  await writeFile(file, generated)
  try {
    const { stdout, stderr } = await execute(execPath, [COMMAND, file], {
      env: {},
      encoding: 'utf8',
      timeout: PROCESS_TIMEOUT
    })
    return { exitCode: 0, stdout, stderr }
  } catch (error) {
    if (!isExitFailure(error)) throw error
    return { exitCode: error.code, stdout: error.stdout, stderr: error.stderr }
  }
}

describe('update-lockfile-versions command', () => {
  it('exits with 0 and writes nothing when the generated lock equals bun.lock', async context => {
    const before = await readLockState()

    const { exitCode, stdout, stderr } = await runCommand({
      context,
      generated: before.text
    })

    assert.equal(exitCode, 0, stderr)
    assert.equal(
      stdout,
      'bun.lock already matches the generated lockfile: nothing to write.\n'
    )
    assert.deepEqual(await readLockState(), before)
  })

  it('exits with 1 and the reason when the generated lock adds a line', async context => {
    const before = await readLockState()

    const { exitCode, stdout, stderr } = await runCommand({
      context,
      generated: `${before.text}\n`
    })

    const lines = before.text.split('\n').length - 1
    assert.equal(exitCode, 1, stderr)
    assert.equal(stdout, '')
    assert.match(
      stderr,
      new RegExp(
        `^error: .+/bun\\.lock has ${lines + 1} lines and bun\\.lock has ${lines}, so it adds or removes lines instead of changing workspace versions\\. Nothing was written\\.\\n$`,
        'u'
      )
    )
    assert.deepEqual(await readLockState(), before)
  })
})
