#!/usr/bin/env node
import process from 'node:process'
import { parseArgs } from 'node:util'

import { cliLanguage, message, messages } from './cli-language.ts'
import { generateTerminal } from './generate.ts'
import { projectSummary } from './projectSummary/index.ts'
import { checkTools, hasTool, toolNames } from './tools.ts'
import type { Answers } from './types.ts'
import {
  CanceledError,
  ProfileProblemError,
  UsageError
} from './usage-error.ts'
import { validateProfile } from './validateProfile/index.ts'

const argumentOffset = 2
const usageExitCode = 2
const terminal = { framed: false }
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
      message(fallback, {
        code: 'unknownLanguage',
        values: { value: requested }
      })
    )
  }
  return cliLanguage({
    ...(requested ? { requested } : {}),
    environment,
    intlLocale
  })
}
const writeStep = (title: string) => process.stdout.write(`◇ ${title}\n`)
type Creation = { answers: Answers; isInteractive: boolean }
async function createApplication({ answers, isInteractive }: Creation) {
  const validated = validateProfile(answers)
  const { profile } = validated
  if (validated.problems[0]) throw validated.problems[0]
  const labels = messages[language]
  if (!isInteractive) checkTools({ profile, language })
  const summary = projectSummary({ validated, language })
  const frame = isInteractive ? await import('./terminal-frame.ts') : undefined
  if (frame) await frame.confirmProject({ summary, language })
  else process.stdout.write(`${labels.summary}\n${summary}\n`)
  const progress = frame?.progress ?? { start: writeStep, finish: writeStep }
  let completed = ''
  const steps = await generateTerminal(
    {
      ...profile,
      ...(frame
        ? {}
        : {
            onSeededCatalogs: (notices: string[]) =>
              process.stdout.write(`${notices.join('\n')}\n`)
          })
    },
    {
      language,
      isInteractive,
      report: code => {
        const values = { pm: toolNames[profile.pm] }
        const title = message(language, { code, values })
        const done = {
          creating: 'created',
          gitTask: 'gitDone',
          installTask: 'installDone'
        } as const
        if (completed) progress.finish(completed)
        progress.start(title)
        completed = message(language, { code: done[code], values })
      }
    }
  )
  if (completed) progress.finish(completed)
  if (frame) {
    frame.finishProject({ steps, language })
    return
  }
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
function hasInteractiveInput() {
  const isCI = !['', '0', 'false'].includes(
    process.env.CI?.trim().toLowerCase() ?? ''
  )
  return process.stdin.isTTY && !isCI
}
async function run(): Promise<void> {
  const args = process.argv.slice(argumentOffset)
  const separator = args.indexOf('--')
  const options = args.slice(0, separator === -1 ? args.length : separator)
  language = detectLanguage(options)
  if (options.some(option => option === '--help' || option === '-h')) {
    const labels = messages[language]
    process.stdout.write(
      [
        labels.usage,
        labels.defaults,
        labels.installerHelp,
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
  const isInteractive =
    hasInteractiveInput() && !values.yes && !values['no-interactive']
  const hasColor =
    process.stdout.isTTY &&
    process.stdout.hasColors() &&
    process.env.NO_COLOR === undefined
  const initial = validateProfile(answers).problems.find(
    issue =>
      !(
        isInteractive &&
        ((issue.field === 'dir' && name === undefined) ||
          (issue.code === 'membership' && values.locales === undefined))
      )
  )
  if (initial) throw initial
  if (isInteractive) {
    terminal.framed = true
    const { questionnaire } = await import('./questionnaire.ts')
    answers = await questionnaire({
      answers,
      language,
      input: process.stdin,
      output: process.stdout,
      hasColor
    })
  }
  if (!isInteractive && !hasTool('bun')) {
    process.stdout.write(`${messages[language].missingBun}\n`)
  }
  await createApplication({ answers, isInteractive })
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
  if (error instanceof CanceledError) {
    reason = [messages[language].cancel, error.message]
      .filter(Boolean)
      .join('\n')
  }
  if (terminal.framed && error instanceof CanceledError) {
    const { outro } = await import('@clack/prompts')
    outro(reason)
  } else process.stderr.write(`${reason}\n`)
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
