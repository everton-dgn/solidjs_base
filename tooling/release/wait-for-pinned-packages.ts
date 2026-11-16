import path from 'node:path'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'

import { createRunner } from './mergePullRequest/runner.ts'
import type { Environment } from './mergePullRequest/types.ts'
import { waitForPinnedPackages } from './waitForPinnedPackages/index.ts'
import { readOptions, USAGE } from './waitForPinnedPackages/options.ts'

// process.argv starts with the Node executable and the path of this script.
const FIRST_ARGUMENT = 2
// WHY: the wait gives each npm call the time it has left, and this limit stops
// a call that hangs sooner, so the wait can read again before --timeout.
const COMMAND_TIMEOUT = 60_000
// The workspace root from the place of this file, so the packages of this
// repository are found whatever folder the job runs the command from.
const ROOT = path.resolve(import.meta.dirname, '../..')

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
    await waitForPinnedPackages({
      tarball: options.tarball,
      root: ROOT,
      timing: options.timing,
      environment
    })
  }
} catch (error) {
  const message = error instanceof Error ? error.message : JSON.stringify(error)
  process.stderr.write(`error: ${message}\n`)
  process.exitCode = 1
}
