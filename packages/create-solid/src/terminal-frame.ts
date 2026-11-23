import process from 'node:process'
import { isatty, WriteStream } from 'node:tty'
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
  output: NodeJS.WriteStream
}

const frames = S_BAR === '│' ? ['◒', '◐', '◓', '◑'] : ['•', 'o', 'O', '0']
const unicodeIntervalMs = 80
const asciiIntervalMs = 120
const noteFormat = { format: (line: string) => line.trimStart() }
const prefixWidth = 3
const clearIndicatorRows = '\r\u001B[J'
let indicator: ReturnType<typeof setInterval> | undefined
let active = ''
let removeStepListeners: (() => void) | undefined
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
function closingOutput(): NodeJS.WriteStream {
  const { stdout } = process
  if (!stdout.isTTY || !isatty(stdout.fd)) return stdout
  // getWindowSize reads the dimensions cached when its stream was initialized.
  let probe: WriteStream | undefined
  try {
    probe = new WriteStream(stdout.fd)
    const [columns] = probe.getWindowSize()
    if (
      !Number.isInteger(columns) ||
      columns <= 0 ||
      columns === stdout.columns
    ) {
      return stdout
    }
    return new Proxy(stdout, {
      get(target, property): unknown {
        if (property === 'columns') return columns
        if (property === 'write') return target.write.bind(target)
        return Reflect.get(target, property)
      }
    })
  } catch {
    return stdout
  } finally {
    probe?.destroy()
  }
}
function showCursor() {
  process.stdout.write('\u001B[?25h')
}
function clearIndicator() {
  if (!active) return
  clearInterval(indicator)
  if (removeStepListeners) {
    removeStepListeners()
    removeStepListeners = undefined
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
type Instructions = { text: string; output: NodeJS.WriteStream }
function wrapInstructions({ text, output }: Instructions): string[] {
  const lines = text.split('\n')
  return lines.flatMap((line, index) => {
    if (isCommand(line)) return [line]
    const wrapped = wrapFrameText({ output, text: line })
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
        const parts = wrapFrameText({ output, text: `${first}:` })
        parts.push(dir, ...wrapFrameText({ output, text: last ?? '' }))
        return parts
      }
    }
    return wrapped
  })
}
export async function confirmProject({
  summary,
  language,
  output
}: Confirmation): Promise<void> {
  const m = messages[language]
  note(summary, m.summary, { ...noteFormat, output })
  const result = await confirm({
    message: m.create,
    active: m.yes,
    inactive: m.no,
    output
  })
  if (isCancel(result)) throw new CanceledError()
  log.message('', { spacing: 0, output })
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
    const resume = () => {
      process.stdout.write('\u001B[?25l')
      resize()
    }
    const suspend = () => {
      process.stdout.write(clearIndicatorRows)
      showCursor()
      process.off('SIGTSTP', suspend)
      // WHY: Without a listener the continue of this stop emits no event, so only the line below restores it.
      process.off('SIGCONT', resume)
      process.kill(process.pid, 'SIGTSTP')
      process.on('SIGTSTP', suspend)
      process.on('SIGCONT', resume)
      resume()
    }
    const quit = () => {
      process.stdout.write(clearIndicatorRows)
      showCursor()
      process.off('SIGQUIT', quit)
      process.kill(process.pid, 'SIGQUIT')
    }
    process.on('SIGTSTP', suspend)
    process.on('SIGCONT', resume)
    process.on('SIGQUIT', quit)
    process.stdout.on('resize', resize)
    removeStepListeners = () => {
      process.stdout.off('resize', resize)
      process.off('SIGTSTP', suspend)
      process.off('SIGCONT', resume)
      process.off('SIGQUIT', quit)
    }
    draw()
    indicator = setInterval(draw, unicode ? unicodeIntervalMs : asciiIntervalMs)
  },
  finish: (title: string): void => {
    clearIndicator()
    const output = closingOutput()
    log.step(stepTitle({ title, columns: output.columns }), {
      spacing: 0,
      output
    })
  },
  warn(message: string): void {
    clearIndicator()
    const output = closingOutput()
    const [title = '', ...diagnostic] = message.split('\n')
    log.warn(
      [
        stepTitle({ title, columns: output.columns }),
        ...diagnostic.flatMap(line => wrapFrameText({ output, text: line }))
      ].join('\n'),
      { spacing: 0, output }
    )
  },
  error(title: string): void {
    clearIndicator()
    const output = closingOutput()
    log.message(stepTitle({ title, columns: output.columns }), {
      symbol: styleText('red', S_STEP_ERROR),
      output,
      spacing: 0
    })
  },
  cancel(): void {
    if (!active) return
    const title = active
    clearIndicator()
    const output = closingOutput()
    log.error(stepTitle({ title, columns: output.columns }), {
      spacing: 0,
      output
    })
  }
}
export function closeQuestion(label: string): void {
  outro(`${styleText('gray', S_BAR_END)}  ${label}`, { withGuide: false })
}
export function closeFrame({ reason, closing }: Closing): void {
  const output = closingOutput()
  if (reason) {
    log.message(wrapInstructions({ text: reason, output }), {
      output,
      spacing: 0
    })
  }
  outro(closing, { output })
}
export function stopFrame({
  reason,
  closing
}: Required<Closing<StopReason>>): void {
  const text = typeof reason === 'string' ? reason : reason.text
  let lines = wrapFrameText({ output: process.stdout, text })
  if (typeof reason !== 'string') {
    const { occupiedDir } = reason
    const start = text.lastIndexOf(occupiedDir)
    if (
      start !== -1 &&
      !hasWholePath({ text, start, dir: occupiedDir, lines })
    ) {
      const before = text.slice(0, start).trimEnd()
      const after = text.slice(start + occupiedDir.length).trimStart()
      lines = [
        ...(before
          ? wrapFrameText({ output: process.stdout, text: before })
          : []),
        ...(/[\p{L}\p{N}]/u.test(after)
          ? [
              occupiedDir,
              ...wrapFrameText({ output: process.stdout, text: after })
            ]
          : [occupiedDir + after])
      ]
    }
  }
  log.warn(lines.join('\n'), {
    spacing: 0
  })
  outro(closing)
}
export function finishProject({ steps, language }: Completion): void {
  const output = closingOutput()
  const m = messages[language]
  const notePrefix = '      '
  if (
    steps.some(
      line =>
        isCommand(line) &&
        (output.columns <= notePrefix.length ||
          wrapTextWithPrefix(output, line, notePrefix).includes('\n'))
    )
  ) {
    log.step(m.next, { output })
    log.message(wrapInstructions({ text: steps.join('\n'), output }), {
      spacing: 0,
      output
    })
  } else note(steps.join('\n'), m.next, { ...noteFormat, output })
  outro(m.ready, { output })
}
