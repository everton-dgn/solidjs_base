import { parseArgs } from 'node:util'

import type { Timing } from './types.ts'

type Options =
  | { isHelp: true }
  | { isHelp: false; tarball: string; timing: Timing }

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

// The workflow passes a shell glob: two matches arrive here as two paths, and
// no match as the pattern itself, which the read of the tarball refuses.
function readTarball(positionals: readonly string[]): string {
  const [tarball] = positionals
  if (positionals.length !== 1 || !tarball) {
    throw new Error(
      `Pass the path of one tarball, not ${positionals.length}, as in: node tooling/release/wait-for-pinned-packages.ts "$RUNNER_TEMP"/release/*.tgz`
    )
  }
  return tarball
}

export const USAGE = `Usage: node tooling/release/wait-for-pinned-packages.ts <tarball>
         [--timeout <minutes>] [--interval <seconds>]

Waits until npm has each package of this repository that the package.json of
the tarball pins in dependencies, optionalDependencies or peerDependencies, as
docs/releasing.md describes. Fails when one of them is still missing at the
time limit, so the publish job stops before npm publish.

  --timeout <minutes>   Longest wait for all the pinned packages (default 10)
  --interval <seconds>  Time between two reads of the registry (default 15)
  -h, --help            Print this help`

export function readOptions(args: readonly string[]): Options {
  const { values, positionals } = parseArgs({
    args: [...args],
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: 'boolean', short: 'h', default: false },
      timeout: { type: 'string', default: '10' },
      interval: { type: 'string', default: '15' }
    }
  })
  if (values.help) return { isHelp: true }
  return {
    isHelp: false,
    tarball: readTarball(positionals),
    timing: {
      timeout: readDuration({
        option: 'timeout',
        value: values.timeout,
        unit: MILLISECONDS_PER_MINUTE
      }),
      interval: readDuration({
        option: 'interval',
        value: values.interval,
        unit: MILLISECONDS_PER_SECOND
      })
    }
  }
}
