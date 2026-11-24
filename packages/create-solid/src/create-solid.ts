#!/usr/bin/env node
import process from 'node:process'
import { parseArgs } from 'node:util'

import { cliLanguage, message, messages } from './cli-language.ts'
import { hideCursor, showCursor } from './constants/cursor.ts'
import { generateTerminal } from './generate.ts'
import { isTerminalOwner } from './isTerminalOwner/index.ts'
import { projectSummary } from './projectSummary/index.ts'
import { questionFrame } from './questionFrame/index.ts'
import { readPendingSignals } from './readPendingSignals/index.ts'
import { questionnaireBase } from './resolve-locale-options.ts'
import type { progress as frameProgress } from './terminal-frame.ts'
import { checkTools, hasTool, toolNames } from './tools.ts'
import type { Answers } from './types.ts'
import {
  CanceledError,
  ProfileProblemError,
  UsageError
} from './usage-error.ts'
import { validateProfile } from './validateProfile/index.ts'

// WHY: A write to a terminal that closed fails with EIO and one to a pipe whose reader ended fails with EPIPE, both on a later tick. The stream then ends and drops later writes, and the CLI goes on with what it was doing, such as waiting for the cleanup of the installer.
const goneOutputCodes = new Set(['EIO', 'EPIPE'])
function dropGoneOutput(error: NodeJS.ErrnoException) {
  if (!goneOutputCodes.has(error.code ?? '')) throw error
}
process.stdout.on('error', dropGoneOutput)
process.stderr.on('error', dropGoneOutput)
const argumentOffset = 2
const usageExitCode = 2
const terminal = { isFramed: false }
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
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
const writeStep = (title: string) => process.stdout.write(`◇ ${title}\n`)
type Creation = { answers: Answers; isInteractive: boolean }
const interruptedExitCode = 130
function writeCancel() {
  process.stdout.write(`\n└  ${messages[language].cancel}\n`)
  process.exit(interruptedExitCode)
}
let isCanceling = false
function cancelPrompt() {
  isCanceling = true
  process.stdout.write(showCursor)
  process.stdin.setRawMode(false)
  writeCancel()
}
// WHY: The change of mode of a terminal that closed failed with ENOENT on macOS and with EIO on Linux.
const closedTerminalCodes = new Set(['EIO', 'ENOENT'])
// WHY: Once the terminal is gone a change of its mode fails with an error of the input, also inside cancelPrompt, so this changes no mode. A write to a closed terminal reports its error on a later tick, after the CLI has ended.
function closeInput(error: NodeJS.ErrnoException) {
  process.stdout.write(showCursor)
  // WHY: An error during a cancel comes from the change of mode of cancelPrompt, so the cancel goes on whatever its code. Any other error of the input that is not a closed terminal is no cancel by the person, so the CLI stops with it as a failure.
  if (!isCanceling && !closedTerminalCodes.has(error.code ?? '')) {
    process.stdout.write(
      `\n▲  ${error.message}\n└  ${messages[language].stopped}\n`
    )
    process.exit(1)
  }
  writeCancel()
}
type Prompt<T> = (output: NodeJS.WriteStream) => Promise<T>
async function withPromptSignals<T>(prompt: Prompt<T>): Promise<T> {
  const frame = questionFrame(process.stdout)
  const resume = () => {
    // WHY: A stopped process gets no SIGWINCH, and Node reads the size of the terminal again only on that signal.
    process.kill(process.pid, 'SIGWINCH')
    if (!frame.isOpen()) return
    // WHY: A shell takes the terminal out of raw mode when it stops a job, and libuv returns early from a mode it has recorded as set.
    process.stdin.setRawMode(false)
    process.stdin.setRawMode(true)
  }
  const suspend = () => {
    // WHY: On Ctrl+Z readline leaves a one-time SIGCONT listener that pauses stdin and, when no continue comes, turns raw mode on during a later step.
    const fromKey = process
      .listeners('SIGCONT')
      .filter(listener => listener !== resume)
    for (const listener of fromKey) process.off('SIGCONT', listener)
    const isKey = fromKey.length > 0
    // WHY: The CLI read the key itself, so a launcher in its group still runs and the shell cannot have taken the terminal.
    const isAlone = isKey || isTerminalOwner()
    if (isAlone) {
      // WHY: The shell writes where the question was, so no copy of it stays above what the shell wrote.
      frame.erase()
      process.stdin.setRawMode(false)
    } else {
      // WHY: The shell of a launcher may own the terminal by now: erasing would reach its prompt, and a change of mode would stop the CLI with SIGTTOU.
      frame.hold()
    }
    process.stdout.write(showCursor)
    process.off('SIGTSTP', suspend)
    // WHY: readline signals only this process for the key, and the terminal would have stopped the whole group. Under a launcher the group stops too, so its shell sees the stop and can continue the CLI.
    process.kill(isAlone && !isKey ? process.pid : 0, 'SIGTSTP')
    process.on('SIGTSTP', suspend)
    // WHY: The kernel discards the stop of an orphaned group, and then no SIGCONT comes to restore the question.
    resume()
    if (frame.isOpen()) process.stdout.write(hideCursor)
  }
  // WHY: This runs after the listener of Node, which reads the new size and lets Clack render the question at it, so the question is drawn once at the width of the terminal.
  const draw = () => frame.flush()
  // WHY: Without a listener Node ends on SIGINT with the cursor hidden. Ctrl+C is a key during a question, so this is a signal sent from outside.
  process.on('SIGINT', cancelPrompt)
  process.on('SIGTERM', cancelPrompt)
  process.on('SIGHUP', cancelPrompt)
  process.on('SIGTSTP', suspend)
  process.on('SIGCONT', resume)
  process.on('SIGWINCH', draw)
  // WHY: A terminal that closes during a question ends the input, and on macOS and Linux no SIGHUP came before Node ended with the question still open.
  process.stdin.on('end', cancelPrompt)
  process.stdin.on('error', closeInput)
  // WHY: readline closes on Ctrl+D at an empty line without ending the input, and Clack then waits for a key that can no longer come. Once the loop is empty nothing can answer the question.
  process.on('beforeExit', cancelPrompt)
  try {
    return await prompt(frame.output)
  } finally {
    // WHY: A Ctrl+Z read together with the key that closes the question is still pending, and without suspend it would be lost and leave the listener of readline.
    await readPendingSignals()
    process.off('SIGINT', cancelPrompt)
    process.off('SIGTERM', cancelPrompt)
    process.off('SIGHUP', cancelPrompt)
    process.off('SIGTSTP', suspend)
    process.off('SIGCONT', resume)
    process.off('SIGWINCH', draw)
    process.stdin.off('end', cancelPrompt)
    process.stdin.off('error', closeInput)
    process.off('beforeExit', cancelPrompt)
  }
}
type GenerationError = { error: unknown; progress?: typeof frameProgress }
function rethrowUsageError({ error, progress }: GenerationError): void {
  if (error instanceof UsageError) {
    progress?.clear()
    throw error
  }
}
type SignalRecord = {
  received: Set<NodeJS.Signals>
  counts: { interrupts: number; echoed: number }
  stop: () => void
}
// WHY: The terminal echoes ^C where the cursor is, and a new line keeps that echo off the next line of the CLI.
function echoBreak({ counts }: SignalRecord): string {
  const hasEcho = counts.interrupts > counts.echoed
  counts.echoed = counts.interrupts
  return hasEcho && process.stderr.isTTY ? '\n' : ''
}
type PlainClosing = {
  lines: string[]
  isCanceled: boolean
  signals: SignalRecord
}
function writePlainClosing({ lines, isCanceled, signals }: PlainClosing): void {
  // WHY: The end of an installer that Ctrl+C interrupted may be read before the SIGINT of the CLI, so a cancellation with no SIGTERM or SIGHUP counts as Ctrl+C.
  if (isCanceled && signals.received.size === 0) signals.counts.interrupts += 1
  const echo = isCanceled ? echoBreak(signals) : ''
  process.stderr.write(echo + lines.join('\n'))
}
function recordSignals(): SignalRecord {
  const names = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const
  const received = new Set<NodeJS.Signals>()
  const counts = { interrupts: 0, echoed: 0 }
  const record = (signal: NodeJS.Signals) => {
    received.add(signal)
    if (signal === 'SIGINT') counts.interrupts += 1
  }
  for (const name of names) process.on(name, record)
  return {
    received,
    counts,
    stop() {
      for (const name of names) process.off(name, record)
    }
  }
}
async function createApplication({ answers, isInteractive }: Creation) {
  if (answers.locales === undefined && answers['base-locale'] === undefined) {
    answers['base-locale'] = questionnaireBase({
      language,
      defaults: validateProfile(answers).defaults
    })
  }
  const validated = validateProfile(answers)
  const { profile } = validated
  if (validated.problems[0]) throw validated.problems[0]
  const labels = messages[language]
  if (!isInteractive) checkTools({ profile, language })
  const summary = projectSummary({ validated, language })
  const frame = isInteractive ? await import('./terminal-frame.ts') : undefined
  if (frame) {
    await withPromptSignals(output =>
      frame.confirmProject({ summary, language, output })
    )
  } else process.stdout.write(`${labels.summary}\n${summary}\n`)
  const progress = frame?.progress
  const finish = progress?.finish ?? writeStep
  let completed = ''
  let active = ''
  let failureTitle = labels.createFailed as string
  let task = ''
  let steps: string[]
  const signals = recordSignals()
  try {
    steps = await generateTerminal(
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
        warn: diagnostic => {
          const title = [labels.gitFailed, diagnostic]
            .filter(Boolean)
            .join('\n')
          if (progress) progress.warn(title)
          else process.stderr.write(`▲ ${title}\n`)
          completed = ''
        },
        report: code => {
          const values = { pm: toolNames[profile.pm] }
          const title = message(language, { code, values })
          const done = {
            creating: 'created',
            gitTask: 'gitDone',
            installTask: 'installDone'
          } as const
          if (completed) finish(completed)
          task = code
          failureTitle =
            code === 'installTask'
              ? message(language, { code: 'installFailed', values })
              : labels.createFailed
          active = title
          progress?.start(title)
          completed = message(language, { code: done[code], values })
        },
        onWait: () => {
          if (task !== 'installTask') return
          const values = { pm: toolNames[profile.pm] }
          const notice = message(language, { code: 'installWait', values })
          if (progress) progress.wait(notice)
          else process.stderr.write(`${echoBreak(signals)}${notice}\n`)
        }
      }
    )
  } catch (error) {
    rethrowUsageError({ error, progress })
    const isCanceled = error instanceof CanceledError
    const reason = errorMessage(error)
    const closing = isCanceled ? labels.cancel : labels.stopped
    if (frame) {
      if (isCanceled) frame.progress.cancel()
      else frame.progress.error(failureTitle)
      frame.closeFrame({ reason, closing })
    } else {
      const title = isCanceled ? `■ ${active}` : `▲ ${failureTitle}`
      writePlainClosing({
        lines: [...[title, reason].filter(Boolean), '', closing, ''],
        isCanceled,
        signals
      })
    }
    process.exitCode = isCanceled ? interruptedExitCode : 1
    return
  } finally {
    signals.stop()
  }
  if (completed) finish(completed)
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
function wrapParagraph(paragraph: string): string {
  const width = 80
  const lines: string[] = []
  let line = ''
  for (const word of paragraph.split(' ')) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line)
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  return [...lines, line].join('\n')
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
        wrapParagraph(labels.defaults),
        wrapParagraph(labels.installerHelp),
        wrapParagraph(labels.automation),
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
    throw new UsageError(messages[language].singleDirectory)
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
    terminal.isFramed = true
    const { questionnaire } = await import('./questionnaire.ts')
    answers = await withPromptSignals(output =>
      questionnaire({
        answers,
        language,
        input: process.stdin,
        output,
        hasColor
      })
    )
  }
  if (!isInteractive && !hasTool('bun')) {
    process.stdout.write(`${messages[language].missingBun}\n`)
  }
  await createApplication({ answers, isInteractive })
}

try {
  await run()
} catch (error) {
  let reason = errorMessage(error)
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
  if (terminal.isFramed) {
    const { stopFrame, closeQuestion, progress } =
      await import('./terminal-frame.ts')
    progress.clear()
    if (error instanceof CanceledError) closeQuestion(messages[language].cancel)
    else {
      const occupiedDir =
        error instanceof ProfileProblemError && error.code === 'occupied'
          ? error.values.dir
          : undefined
      stopFrame({
        reason: occupiedDir ? { text: reason, occupiedDir } : reason,
        closing: messages[language].stopped
      })
    }
  } else process.stderr.write(`${reason}\n`)
  const isArgumentError =
    error instanceof UsageError ||
    (error instanceof TypeError &&
      'code' in error &&
      typeof error.code === 'string' &&
      (error.code.startsWith('ERR_PARSE_ARGS_') ||
        error.code === 'ERR_INVALID_URL'))
  process.exitCode = isArgumentError ? usageExitCode : 1
  if (error instanceof CanceledError) process.exitCode = interruptedExitCode
}
