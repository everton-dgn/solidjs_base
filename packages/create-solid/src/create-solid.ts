#!/usr/bin/env node
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { generate } from './generate.ts'
import { UsageError } from './usage-error.ts'

const argumentOffset = 2
const usageExitCode = 2
type LanguageFlags = { locales?: string; 'base-locale'?: string }
function localeFlags(values: LanguageFlags) {
  return {
    ...(values.locales === undefined
      ? {}
      : { locales: values.locales.split(',') }),
    ...(values['base-locale'] === undefined
      ? {}
      : { baseLocale: values['base-locale'] })
  }
}
function run(): void {
  const usage =
    'bunx @evertondgn/create-solid@latest <dir> [--pm bun|pnpm|npm] [--title TEXT] [--locales TAGS|--no-i18n] [--base-locale TAG] [--site-url URL] [--mode server|static|client] [--seo|--no-seo] [--theme|--no-theme] [--icons|--no-icons] [--fonts|--no-fonts] [--diagnostics|--no-diagnostics] [--no-git] [--no-install]\nBun is required to run application tasks with every installer.'
  const args = process.argv.slice(argumentOffset)
  const separator = args.indexOf('--')
  if (
    args.slice(0, separator === -1 ? args.length : separator).includes('--help')
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
      title: { type: 'string' },
      locales: { type: 'string' },
      'base-locale': { type: 'string' },
      'no-i18n': { type: 'boolean' },
      'site-url': { type: 'string' },
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
    ...(values.title === undefined ? {} : { title: values.title }),
    ...localeFlags(values),
    hasI18n: !values['no-i18n'],
    mode: values.mode,
    hasSeo: values.mode === 'client' ? Boolean(values.seo) : !values['no-seo'],
    hasTheme: !values['no-theme'],
    hasIcons: !values['no-icons'],
    hasFonts: !values['no-fonts'],
    hasDiagnostics: !values['no-diagnostics'],
    ...(values['site-url'] === undefined
      ? {}
      : { siteUrl: values['site-url'] }),
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
