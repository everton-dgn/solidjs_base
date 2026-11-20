#!/usr/bin/env node
import process from 'node:process'
import { parseArgs } from 'node:util'

import { cliLanguage, message, messages } from './cli-language.ts'
import { generateTerminal } from './generate.ts'
import type { Answers } from './profile-answers.ts'
import { hasTool } from './tools.ts'
import {
  CanceledError,
  ProfileProblemError,
  UsageError
} from './usage-error.ts'
import { validateProfile } from './validate-profile.ts'

const argumentOffset = 2
const usageExitCode = 2
let language: ReturnType<typeof cliLanguage> = 'en'
function detectLanguage(options: string[]) {
  const index = options.findLastIndex(
    arg => arg === '--lang' || arg.startsWith('--lang=')
  )
  const requested =
    options[index] === '--lang'
      ? options[index + 1]
      : options[index]?.slice('--lang='.length)
  const environment = process.env
  const intlLocale = Intl.DateTimeFormat().resolvedOptions().locale
  const fallback = cliLanguage({ environment, intlLocale })
  if (requested !== undefined && !Object.hasOwn(messages, requested)) {
    throw new UsageError(
      message(fallback, { code: 'invalid', values: { flag: '--lang' } })
    )
  }
  return cliLanguage({
    ...(requested ? { requested } : {}),
    environment,
    intlLocale
  })
}
async function createApplication(answers: Answers) {
  const validated = validateProfile(answers)
  const { profile } = validated
  if (validated.problems[0]) throw validated.problems[0]
  const labels = messages[language]
  const enabled = (value?: boolean) => (value ? labels.yes : labels.no)
  process.stdout.write(
    `${[
      labels.summary,
      `${labels.dir} · ${profile.dir}`,
      `${labels.title} · ${validated.title}`,
      `${labels.mode} · ${labels[profile.mode ?? 'server']}`,
      `${labels.languages} · ${validated.languages.locales.join(', ')}`,
      `${labels.base} ${validated.languages.baseLocale}`,
      `${labels.i18n} ${enabled(profile.hasI18n)}`,
      `${labels.seo} ${enabled(profile.hasSeo)}`,
      validated.siteUrl?.origin,
      `${labels.theme} ${enabled(profile.hasTheme)}`,
      `${labels.icons} ${enabled(profile.hasIcons)}`,
      `${labels.fonts} ${enabled(profile.hasFonts)}`,
      `${labels.diagnostics} ${enabled(profile.hasDiagnostics)}`,
      `${labels.manager} · ${profile.pm}`,
      `${labels.git} ${enabled(profile.shouldInitGit)}`,
      `${labels.install} ${enabled(profile.shouldInstall)}`
    ]
      .filter(Boolean)
      .join('\n')}\n`
  )
  const steps = await generateTerminal(
    {
      ...profile,
      onSeededCatalogs: notices =>
        process.stdout.write(`${notices.join('\n')}\n`)
    },
    {
      language,
      report: code =>
        process.stdout.write(
          `◇ ${message(language, { code, values: { pm: profile.pm } })}\n`
        )
    }
  )
  const width = Math.max(labels.next.length, ...steps.map(step => step.length))
  const border = '─'.repeat(width)
  process.stdout.write(
    [
      `┌─${border}─┐`,
      ...[labels.next, ...steps].map(line => `│ ${line.padEnd(width)} │`),
      `└─${border}─┘`,
      ''
    ].join('\n')
  )
}
async function run(): Promise<void> {
  const args = process.argv.slice(argumentOffset)
  const separator = args.indexOf('--')
  const options = args.slice(0, separator === -1 ? args.length : separator)
  language = detectLanguage(options)
  if (options.includes('--help')) {
    const labels = messages[language]
    process.stdout.write(
      [
        labels.usage,
        labels.defaults,
        labels.installer,
        labels.automation,
        ''
      ].join('\n')
    )
    return
  }
  if (process.platform === 'win32') {
    throw new Error(messages[language].windows)
  }
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      yes: { type: 'boolean' },
      'no-interactive': { type: 'boolean' },
      name: { type: 'string' },
      git: { type: 'boolean' },
      install: { type: 'boolean' },
      lang: { type: 'string' },
      mode: { type: 'string' },
      pm: { type: 'string' },
      title: { type: 'string' },
      locales: { type: 'string' },
      'base-locale': { type: 'string' },
      i18n: { type: 'boolean' },
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
  if (
    positionals.length > 1 ||
    (values.name !== undefined && positionals.length > 0)
  ) {
    throw new ProfileProblemError({ field: 'dir', code: 'destination' })
  }
  const name =
    positionals[0] ?? values.name ?? (values.yes ? 'solid-app' : undefined)
  let answers = { ...values, ...(name === undefined ? {} : { name }) }
  const isCI = !['', '0', 'false'].includes(
    process.env.CI?.trim().toLowerCase() ?? ''
  )
  const interactive =
    process.stdin.isTTY && !isCI && !values.yes && !values['no-interactive']
  const hasColor =
    process.stdout.isTTY &&
    process.stdout.hasColors() &&
    process.env.NO_COLOR === undefined
  const initial = validateProfile(answers).problems.find(
    issue =>
      !(
        interactive &&
        ((issue.field === 'dir' && name === undefined) ||
          (issue.code === 'membership' && values.locales === undefined))
      )
  )
  if (initial) throw initial
  if (interactive) {
    const { questionnaire } = await import('./questionnaire.ts')
    answers = await questionnaire({
      answers,
      language,
      input: process.stdin,
      output: process.stdout,
      hasColor
    })
  } else if (!hasTool('bun')) {
    process.stdout.write(`${messages[language].missingBun}\n`)
  }
  await createApplication(answers)
}

try {
  await run()
} catch (error) {
  let reason = error instanceof Error ? error.message : String(error)
  if (error instanceof ProfileProblemError) reason = error.describe(language)
  if (
    error instanceof TypeError &&
    'code' in error &&
    String(error.code).startsWith('ERR_PARSE_ARGS_')
  ) {
    reason = message(language, {
      code: 'invalid',
      values: { flag: /--?[\w-]+/u.exec(error.message)?.[0] ?? error.message }
    })
  }
  if (error instanceof CanceledError) reason = messages[language].cancel
  process.stderr.write(`${reason}\n`)
  const isArgumentError =
    error instanceof UsageError ||
    (error instanceof TypeError &&
      'code' in error &&
      typeof error.code === 'string' &&
      (error.code.startsWith('ERR_PARSE_ARGS_') ||
        error.code === 'ERR_INVALID_URL'))
  process.exitCode = isArgumentError ? usageExitCode : 1
  if (error instanceof CanceledError) process.exitCode = 130
}
