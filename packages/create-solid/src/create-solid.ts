#!/usr/bin/env node
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { generate } from './generate.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    pm: { type: 'string', default: 'bun' },
    help: { type: 'boolean' },
    'no-git': { type: 'boolean' },
    'no-install': { type: 'boolean' }
  }
})
const usage =
  'create-solid <dir> [--pm bun|pnpm|npm] [--no-git] [--no-install]\nBun is required to run application tasks with every installer.'
if (values.help) {
  process.stdout.write(`${usage}\n`)
  process.exit(0)
}
if (
  positionals.length !== 1 ||
  !positionals[0] ||
  (values.pm !== 'bun' && values.pm !== 'pnpm' && values.pm !== 'npm')
) {
  throw new Error(usage)
}
const profile = {
  pm: values.pm,
  dir: path.resolve(positionals[0]),
  shouldInitGit: !values['no-git'],
  shouldInstall: !values['no-install']
} as const
generate(profile)
