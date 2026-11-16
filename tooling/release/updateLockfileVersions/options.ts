import { parseArgs } from 'node:util'

type Options = { isHelp: true } | { isHelp: false; generated: string }

function readGenerated(positionals: readonly string[]): string {
  const [generated] = positionals
  if (positionals.length !== 1 || !generated) {
    throw new Error(
      `Pass the path of one generated lockfile, not ${positionals.length}, as in: node tooling/release/update-lockfile-versions.ts "$RUNNER_TEMP"/lockfile/bun.lock`
    )
  }
  return generated
}

export const USAGE = `Usage: node tooling/release/update-lockfile-versions.ts <generated bun.lock>

Writes a lockfile generated from this tree over bun.lock when the only lines
it changes are the "version" of workspace entries, each one equal to the
version in the package.json of that folder, as docs/releasing.md describes.
Any other difference fails the command, and nothing is written.

  -h, --help  Print this help`

export function readOptions(args: readonly string[]): Options {
  const { values, positionals } = parseArgs({
    args: [...args],
    allowPositionals: true,
    strict: true,
    options: { help: { type: 'boolean', short: 'h', default: false } }
  })
  if (values.help) return { isHelp: true }
  return { isHelp: false, generated: readGenerated(positionals) }
}
