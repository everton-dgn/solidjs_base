import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type { Command, CommandResult, RunCommand } from './types.ts'
import { describeDuration } from './wait.ts'

type ExitFailure = { code: number; stdout: string; stderr: string }

const execute = promisify(execFile)
const MAX_OUTPUT_BYTES = 67_108_864
// The exit code the timeout utility reports for a command it stopped.
const TIMED_OUT_EXIT_CODE = 124
// The subcommand and the endpoint, without the fields and the GraphQL query.
const NAMED_ARGUMENTS = 2

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

// A command that execFile stops at the timeout has no exit code.
function isTimeout(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'killed' in error &&
    error.killed === true &&
    'code' in error &&
    error.code === null
  )
}

export function createRunner(timeout: number): RunCommand {
  return async ({ file, args }: Command): Promise<CommandResult> => {
    try {
      const { stdout, stderr } = await execute(file, args, {
        encoding: 'utf8',
        maxBuffer: MAX_OUTPUT_BYTES,
        timeout
      })
      return { exitCode: 0, stdout, stderr }
    } catch (error) {
      if (isTimeout(error)) {
        const command = [file, ...args.slice(0, NAMED_ARGUMENTS)].join(' ')
        return {
          exitCode: TIMED_OUT_EXIT_CODE,
          stdout: '',
          stderr: `${command} did not finish within ${describeDuration(timeout)} and was stopped.`
        }
      }
      if (!isExitFailure(error)) throw error
      return {
        exitCode: error.code,
        stdout: error.stdout,
        stderr: error.stderr
      }
    }
  }
}
