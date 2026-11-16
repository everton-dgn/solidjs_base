import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { execPath } from 'node:process'
import { describe, it, type TestContext } from 'node:test'
import { promisify } from 'node:util'

import { makeFolder, packManifest } from './fixtures.ts'

type CommandRun = { context: TestContext; manifest: unknown }

type CommandOutcome = { exitCode: unknown; stdout: string; stderr: string }

type ExitFailure = { code: unknown; stdout: string; stderr: string }

const execute = promisify(execFile)

const COMMAND = path.resolve(
  import.meta.dirname,
  '../../wait-for-pinned-packages.ts'
)
// The command reads the packages of the workspace around its own file, so the
// tarballs carry the names of packages of this repository.
const TOOLING = '@evertondgn/solid-tooling'
const ICONS = '@evertondgn/vite-plugin-solid-icons'
const RUNTIME = '@evertondgn/solid-runtime'
const VERSION = '9.9.9'
// An npm that never has the version, as before the publish of a package.
const MISSING_NPM = "#!/bin/sh\necho 'npm error code E404' >&2\nexit 1\n"
const EXECUTABLE = 0o755
// Minutes and seconds, as the options take them: 0.6 s and 0.1 s.
const TIMEOUT = '0.01'
const INTERVAL = '0.1'
// Far above the time limit of the wait, so only a command that hangs reaches it.
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

// WHY: PATH holds only the folder of the fake npm, so the command cannot reach
// a real npm of the machine.
async function runCommand({
  context,
  manifest
}: CommandRun): Promise<CommandOutcome> {
  const folder = await makeFolder(context)
  const bin = path.join(folder, 'bin')
  await mkdir(bin)
  await writeFile(path.join(bin, 'npm'), MISSING_NPM)
  await chmod(path.join(bin, 'npm'), EXECUTABLE)
  const tarball = await packManifest({ folder, manifest })
  const args = [COMMAND, tarball, '--timeout', TIMEOUT, '--interval', INTERVAL]
  try {
    const { stdout, stderr } = await execute(execPath, args, {
      env: { PATH: bin },
      encoding: 'utf8',
      timeout: PROCESS_TIMEOUT
    })
    return { exitCode: 0, stdout, stderr }
  } catch (error) {
    if (!isExitFailure(error)) throw error
    return { exitCode: error.code, stdout: error.stdout, stderr: error.stderr }
  }
}

describe('wait-for-pinned-packages command', () => {
  it('exits with 1 and the message of the wait when the pinned version stays missing', async context => {
    const { exitCode, stdout, stderr } = await runCommand({
      context,
      manifest: {
        name: TOOLING,
        version: VERSION,
        dependencies: { [ICONS]: VERSION }
      }
    })

    assert.equal(exitCode, 1, stderr)
    assert.ok(
      stdout.startsWith(
        `${TOOLING}@${VERSION} pins ${ICONS}@${VERSION} in dependencies. Waiting up to 600 millisecond(s) for npm to have them.\n`
      ),
      stdout
    )
    assert.match(
      stderr,
      /^error: @evertondgn\/vite-plugin-solid-icons@9\.9\.9 did not appear on npm within 600 millisecond\(s\) \(.+\)\.\n@evertondgn\/solid-tooling@9\.9\.9 pins it in dependencies, so it was not published/u
    )
  })

  it('exits with 0 when the tarball pins no package of this repository', async context => {
    const { exitCode, stdout, stderr } = await runCommand({
      context,
      manifest: { name: RUNTIME, version: VERSION }
    })

    assert.equal(exitCode, 0, stderr)
    assert.equal(
      stdout,
      `${RUNTIME}@${VERSION} pins no package of this repository in dependencies, optionalDependencies, peerDependencies: nothing to wait for.\n`
    )
  })
})
