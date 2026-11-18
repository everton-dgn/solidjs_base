#!/usr/bin/env node
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { generate } from './generate.ts'
import { UsageError } from './usage-error.ts'

const usageExitCode = 2
function run(): void {
  if (process.platform === 'win32') {
    throw new Error(
      'create-solid supports macOS and Linux. Windows is unsupported.'
    )
  }
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      pm: { type: 'string', default: 'bun' },
      'site-url': { type: 'string', default: 'https://example.com' },
      diagnostics: { type: 'boolean' },
      'no-diagnostics': { type: 'boolean' },
      help: { type: 'boolean' },
      'no-git': { type: 'boolean' },
      'no-install': { type: 'boolean' }
    }
  })
  const usage =
    'bunx @evertondgn/create-solid@latest <dir> [--pm bun|pnpm|npm] [--site-url URL] [--diagnostics|--no-diagnostics] [--no-git] [--no-install]\nBun is required to run application tasks with every installer.'
  if (values.help) {
    process.stdout.write(`${usage}\n`)
    process.exit(0)
  }
  if (
    positionals.length !== 1 ||
    !positionals[0] ||
    (values.pm !== 'bun' && values.pm !== 'pnpm' && values.pm !== 'npm')
  ) {
    throw new UsageError(usage)
  }
  const profile = {
    diagnostics: !values['no-diagnostics'],
    siteUrl: values['site-url'],
    pm: values.pm,
    dir: path.resolve(positionals[0]),
    shouldInitGit: !values['no-git'],
    shouldInstall: !values['no-install']
  } as const
  process.stdout.write(`${generate(profile).join('\n')}\n`)
}
try {
  run()
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  )
  const isArgumentError =
    error instanceof UsageError ||
    (error instanceof TypeError &&
      'code' in error &&
      typeof error.code === 'string' &&
      (error.code.startsWith('ERR_PARSE_ARGS_') ||
        error.code === 'ERR_INVALID_URL'))
  process.exitCode = isArgumentError ? usageExitCode : 1
}
