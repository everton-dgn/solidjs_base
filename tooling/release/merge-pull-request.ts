import process from 'node:process'
import { setTimeout } from 'node:timers/promises'

import { mergePullRequest } from './mergePullRequest/index.ts'
import { readOptions, USAGE } from './mergePullRequest/options.ts'
import { createRunner } from './mergePullRequest/runner.ts'
import type { Environment } from './mergePullRequest/types.ts'

// process.argv starts with the Node executable and the path of this script.
const FIRST_ARGUMENT = 2
// WHY: the waits check their deadline between two calls, so a gh or npm call
// that hangs would hold the command past --timeout.
const COMMAND_TIMEOUT = 120_000

function writeLine(line: string): void {
  process.stdout.write(`${line}\n`)
}

const environment: Environment = {
  run: createRunner(COMMAND_TIMEOUT),
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
