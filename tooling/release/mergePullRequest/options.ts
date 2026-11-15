import { parseArgs } from 'node:util'

import type { MergeRequest } from './types.ts'

type Options =
  | { isHelp: true }
  | ({ isHelp: false } & Omit<MergeRequest, 'environment'>)

type Duration = { option: string; value: string; unit: number }

const MILLISECONDS_PER_SECOND = 1000
const MILLISECONDS_PER_MINUTE = 60_000

function readDuration({ option, value, unit }: Duration): number {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`--${option} takes a positive number, not "${value}".`)
  }
  return amount * unit
}

function readNumber(positionals: readonly string[]): number {
  const [value] = positionals
  if (positionals.length !== 1 || !value || !/^[1-9]\d*$/u.test(value)) {
    throw new Error(
      'Pass the number of one pull request, as in: vp run release:merge 42'
    )
  }
  return Number(value)
}

export const USAGE = `Usage: vp run release:merge <number> [--dry-run] [--interval <seconds>]
         [--timeout <minutes>] [--registry-timeout <minutes>]

Merges a pull request with a merge commit, as docs/releasing.md describes, and
checks the publication of a release pull request.

  --dry-run                     Read the state and print what would happen, without
                                updating the branch, approving a run or merging
  --interval <seconds>          Time between two reads of a check, a workflow run
                                or the registry (default 30)
  --timeout <minutes>           Longest wait for CI required, and for the Release
                                workflow after the merge (default 60)
  --registry-timeout <minutes>  Longest wait for each version on npm (default 10)
  -h, --help                    Print this help`

export function readOptions(args: readonly string[]): Options {
  const { values, positionals } = parseArgs({
    args: [...args],
    allowPositionals: true,
    strict: true,
    options: {
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      interval: { type: 'string', default: '30' },
      timeout: { type: 'string', default: '60' },
      'registry-timeout': { type: 'string', default: '10' }
    }
  })
  if (values.help) return { isHelp: true }
  return {
    isHelp: false,
    number: readNumber(positionals),
    isDryRun: values['dry-run'],
    timing: {
      interval: readDuration({
        option: 'interval',
        value: values.interval,
        unit: MILLISECONDS_PER_SECOND
      }),
      checkTimeout: readDuration({
        option: 'timeout',
        value: values.timeout,
        unit: MILLISECONDS_PER_MINUTE
      }),
      registryTimeout: readDuration({
        option: 'registry-timeout',
        value: values['registry-timeout'],
        unit: MILLISECONDS_PER_MINUTE
      })
    }
  }
}
