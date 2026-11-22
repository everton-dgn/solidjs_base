import process from 'node:process'
import { styleText } from 'node:util'

import { wrapTextWithPrefix } from '@clack/core'
import {
  S_BAR,
  S_STEP_ERROR,
  S_BAR_END,
  unicode,
  confirm,
  isCancel,
  note,
  outro,
  log
} from '@clack/prompts'

import { messages, type Language } from './cli-language.ts'
import { CanceledError } from './usage-error.ts'
import { wrapFrameText } from './wrapFrameText/index.ts'

type Completion = {
  steps: string[]
  language: Language
}

type StopReason = string | { text: string; occupiedDir: string }
type Closing<Reason = string> = { reason: Reason; closing?: string }

type Confirmation = {
  summary: string
  language: Language
}

const frames = S_BAR === '│' ? ['◒', '◐', '◓', '◑'] : ['•', 'o', 'O', '0']
const unicodeIntervalMs = 80
const asciiIntervalMs = 120
const noteFormat = { format: (line: string) => line.trimStart() }
const prefixWidth = 3
const clearIndicatorRows = '\r\u001B[J'
let indicator: ReturnType<typeof setInterval> | undefined
let active = ''
let removeResizeListener: (() => void) | undefined
type StepTitle = { title: string; columns?: number }
function stepTitle({
  title,
  columns = process.stdout.columns
}: StepTitle): string {
  if (!Number.isFinite(columns)) return title
  const width = Math.max(0, columns - prefixWidth)
  if (title.length <= width) return title
  const ellipsis = (unicode ? '…' : '...').slice(0, width)
  return title.slice(0, width - ellipsis.length).trimEnd() + ellipsis
}
function showCursor() {
  process.stdout.write('\u001B[?25h')
}
function clearIndicator() {
  if (!active) return
  clearInterval(indicator)
  if (removeResizeListener) {
    removeResizeListener()
    removeResizeListener = undefined
    process.stdout.write(clearIndicatorRows)
    showCursor()
    process.off('exit', showCursor)
  }
  indicator = undefined
  active = ''
}
function isCommand(line: string): boolean {
  return /^(?:cd .+|git init|(?:npm|pnpm|bun) install|bun run dev)$/u.test(line)
}
function wrapLine(text: string): string[] {
  return wrapFrameText({ output: process.stdout, text })
}
type PathSpan = { text: string; start: number; dir: string; lines: string[] }
function hasWholePath({ text, start, dir, lines }: PathSpan): boolean {
  let offset = 0
  for (const line of lines) {
    const begin = text.indexOf(line, offset)
    offset = begin + line.length
    if (start >= begin && start + dir.length <= offset) return true
  }
  return false
}
function wrapInstructions(text: string): string[] {
  const lines = text.split('\n')
  return lines.flatMap((line, index) => {
    if (isCommand(line)) return [line]
    const wrapped = wrapLine(line)
    const command = lines[index + 1]
    if (!command?.startsWith('cd ')) return wrapped
    const dir = command.slice('cd '.length)
    for (const labels of Object.values(messages)) {
      if (labels.resume.replace('{dir}', () => dir) === line) {
        const start = labels.resume.indexOf('{dir}')
        if (hasWholePath({ text: line, start, dir, lines: wrapped })) {
          return wrapped
        }
        const [first, last] = labels.resume.split(' {dir}. ')
        const parts = wrapLine(`${first}:`)
        parts.push(dir, ...wrapLine(last ?? ''))
        return parts
      }
    }
    return wrapped
  })
}
export async function confirmProject({
  summary,
  language
}: Confirmation): Promise<void> {
  const m = messages[language]
  note(summary, m.summary, noteFormat)
  const result = await confirm({
    message: m.create,
    active: m.yes,
    inactive: m.no
  })
  if (isCancel(result)) throw new CanceledError()
  log.message('', { spacing: 0 })
  if (!result) throw new CanceledError()
}
export const progress = {
  clear: clearIndicator,
  start(title: string): void {
    active = title
    if (!process.stdout.isTTY) return
    process.once('exit', showCursor)
    process.stdout.write('\u001B[?25l')
    let index = 0
    const draw = () => {
      const mark = styleText('magenta', frames[index] ?? '')
      const { columns } = process.stdout
      if (columns < 1) return
      const label = stepTitle({ title, columns })
      const line = label ? `${mark}  ${label}` : mark
      process.stdout.write(`\r\u001B[?7l${line}\u001B[?7h\r`)
      index = (index + 1) % frames.length
    }
    const resize = () => {
      process.stdout.write(clearIndicatorRows)
      draw()
    }
    process.stdout.on('resize', resize)
    removeResizeListener = () => process.stdout.off('resize', resize)
    draw()
    indicator = setInterval(draw, unicode ? unicodeIntervalMs : asciiIntervalMs)
  },
  finish: (title: string): void => {
    clearIndicator()
    log.step(stepTitle({ title }), { spacing: 0 })
  },
  warn(message: string): void {
    clearIndicator()
    const [title = '', ...diagnostic] = message.split('\n')
    log.warn(
      [
        stepTitle({ title }),
        ...diagnostic.flatMap(line =>
          wrapFrameText({ output: process.stdout, text: line })
        )
      ].join('\n'),
      { spacing: 0 }
    )
  },
  error(title: string): void {
    clearIndicator()
    log.message(stepTitle({ title }), {
      symbol: styleText('red', S_STEP_ERROR),
      spacing: 0
    })
  },
  cancel(): void {
    if (!active) return
    const title = active
    clearIndicator()
    log.error(stepTitle({ title }), { spacing: 0 })
  }
}
export function closeQuestion(label: string): void {
  outro(`${styleText('gray', S_BAR_END)}  ${label}`, { withGuide: false })
}
export function closeFrame({ reason, closing }: Closing): void {
  if (reason) {
    log.message(wrapInstructions(reason), {
      spacing: 0
    })
  }
  outro(closing)
}
export function stopFrame({
  reason,
  closing
}: Required<Closing<StopReason>>): void {
  const text = typeof reason === 'string' ? reason : reason.text
  let lines = wrapLine(text)
  if (
    typeof reason !== 'string' &&
    !hasWholePath({
      text,
      start: text.length - reason.occupiedDir.length,
      dir: reason.occupiedDir,
      lines
    })
  ) {
    lines = [
      ...wrapLine(text.slice(0, -reason.occupiedDir.length).trimEnd()),
      reason.occupiedDir
    ]
  }
  log.warn(lines.join('\n'), {
    spacing: 0
  })
  outro(closing)
}
export function finishProject({ steps, language }: Completion): void {
  const m = messages[language]
  const notePrefix = '      '
  if (
    steps.some(
      line =>
        isCommand(line) &&
        (process.stdout.columns <= notePrefix.length ||
          wrapTextWithPrefix(process.stdout, line, notePrefix).includes('\n'))
    )
  ) {
    log.step(m.next)
    log.message(wrapInstructions(steps.join('\n')), { spacing: 0 })
  } else note(steps.join('\n'), m.next, noteFormat)
  outro(m.ready)
}
