import path from 'node:path'
import process from 'node:process'

import { updateLockfileVersions } from './updateLockfileVersions/index.ts'
import { readOptions, USAGE } from './updateLockfileVersions/options.ts'

// process.argv starts with the Node executable and the path of this script.
const FIRST_ARGUMENT = 2
// The workspace root from the place of this file, so the command checks the
// bun.lock and the package.json files of the tree it belongs to.
const ROOT = path.resolve(import.meta.dirname, '../..')

function writeLine(line: string): void {
  process.stdout.write(`${line}\n`)
}

try {
  const options = readOptions(process.argv.slice(FIRST_ARGUMENT))
  if (options.isHelp) {
    writeLine(USAGE)
  } else {
    await updateLockfileVersions({
      generated: options.generated,
      root: ROOT,
      log: writeLine
    })
  }
} catch (error) {
  const message = error instanceof Error ? error.message : JSON.stringify(error)
  process.stderr.write(`error: ${message}\n`)
  process.exitCode = 1
}
