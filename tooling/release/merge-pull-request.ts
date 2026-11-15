import { execFile } from 'node:child_process'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'
import { promisify } from 'node:util'

import { mergePullRequest } from './mergePullRequest/index.ts'
import { readOptions, USAGE } from './mergePullRequest/options.ts'
import type {
  Command,
  CommandResult,
  Environment
} from './mergePullRequest/types.ts'

type ExitFailure = { code: number; stdout: string; stderr: string }

const execute = promisify(execFile)
const MAX_OUTPUT_BYTES = 67_108_864
// process.argv starts with the Node executable and the path of this script.
const FIRST_ARGUMENT = 2

// execFile rejects when the command exits with a code other than zero; the
// flow reads that code and the output, such as a merge GitHub refused.
function isExitFailure(error: unknown): error is ExitFailure {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'number' &&
    'stdout' in error &&
    typeof error.stdout === 'string' &&
    'stderr' in error &&
    typeof error.stderr === 'string'
  )
}

async function runCommand({ file, args }: Command): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execute(file, args, {
      encoding: 'utf8',
      maxBuffer: MAX_OUTPUT_BYTES
    })
    return { exitCode: 0, stdout, stderr }
  } catch (error) {
    if (!isExitFailure(error)) throw error
    return { exitCode: error.code, stdout: error.stdout, stderr: error.stderr }
  }
}

function writeLine(line: string): void {
  process.stdout.write(`${line}\n`)
}

const environment: Environment = {
  run: runCommand,
  log: writeLine,
  sleep: milliseconds => setTimeout(milliseconds),
  now: () => Date.now()
}

try {
  const options = readOptions(process.argv.slice(FIRST_ARGUMENT))
  if (options.isHelp) {
    writeLine(USAGE)
  } else {
    const { number, expectedSha, isDryRun, timing } = options
    await mergePullRequest({
      number,
      expectedSha,
      isDryRun,
      timing,
      environment
    })
  }
} catch (error) {
  const message = error instanceof Error ? error.message : JSON.stringify(error)
  process.stderr.write(`error: ${message}\n`)
  process.exitCode = 1
}
