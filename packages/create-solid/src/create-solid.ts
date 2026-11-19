#!/usr/bin/env node
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { generate } from './generate.ts'
import { UsageError } from './usage-error.ts'

const usageExitCode = 2
function run(): void {
  const usage =
    'bunx @evertondgn/create-solid@latest <dir> [--pm bun|pnpm|npm] [--site-url URL] [--mode server|static|client] [--seo|--no-seo] [--theme|--no-theme] [--icons|--no-icons] [--fonts|--no-fonts] [--diagnostics|--no-diagnostics] [--no-git] [--no-install]\nBun is required to run application tasks with every installer.'
  const args = process.argv.slice(2)
  const separator = args.indexOf('--')
  if (
    args.slice(0, separator < 0 ? args.length : separator).includes('--help')
  ) {
    process.stdout.write(`${usage}\n`)
    return
  }
  if (process.platform === 'win32') {
    throw new Error(
      'create-solid supports macOS and Linux. Windows is unsupported.'
    )
  }
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      mode: { type: 'string', default: 'server' },
      pm: { type: 'string', default: 'bun' },
      'site-url': { type: 'string', default: 'https://example.com' },
      seo: { type: 'boolean' },
      'no-seo': { type: 'boolean' },
      theme: { type: 'boolean' },
      'no-theme': { type: 'boolean' },
      icons: { type: 'boolean' },
      'no-icons': { type: 'boolean' },
      fonts: { type: 'boolean' },
      'no-fonts': { type: 'boolean' },
      diagnostics: { type: 'boolean' },
      'no-diagnostics': { type: 'boolean' },
      help: { type: 'boolean' },
      'no-git': { type: 'boolean' },
      'no-install': { type: 'boolean' }
    }
  })
  for (const option of [
    'seo',
    'theme',
    'icons',
    'fonts',
    'diagnostics'
  ] as const) {
    if (values[option] && values[`no-${option}`]) {
      throw new UsageError(`Choose either --${option} or --no-${option}.`)
    }
  }
  if (values.mode === 'client' && values.seo) {
    throw new UsageError(
      'Client rendering cannot publish SEO. Use --mode static.'
    )
  }
  if (
    (values.mode !== 'server' &&
      values.mode !== 'static' &&
      values.mode !== 'client') ||
    positionals.length !== 1 ||
    !positionals[0] ||
    (values.pm !== 'bun' && values.pm !== 'pnpm' && values.pm !== 'npm')
  ) {
    throw new UsageError(usage)
  }
  const profile = {
    mode: values.mode,
    seo: values.mode === 'client' ? Boolean(values.seo) : !values['no-seo'],
    theme: !values['no-theme'],
    icons: !values['no-icons'],
    fonts: !values['no-fonts'],
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
