import path from 'node:path'
import process from 'node:process'
import {
  clearImmediate,
  clearInterval,
  setImmediate,
  setInterval
} from 'node:timers'
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
import { hideCursor, showCursor } from './constants/cursor.ts'
import { isTerminalOwner } from './isTerminalOwner/index.ts'
import { listenEndKey } from './listenEndKey/index.ts'
import { CanceledError } from './usage-error.ts'
import { widthLines } from './widthLines/index.ts'
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
  onEnd: () => void
}

const frames = S_BAR === '│' ? ['◒', '◐', '◓', '◑'] : ['•', 'o', 'O', '0']
const unicodeIntervalMs = 80
const asciiIntervalMs = 120
const noteFormat = { format: (line: string) => line.trimStart() }
const notePrefix = '      '
const prefixWidth = 3
const clearIndicatorRows = '\r\u001B[J'
let indicator: ReturnType<typeof setInterval> | undefined
let active = ''
let removeStepListeners: (() => void) | undefined
let redrawStep: (() => void) | undefined
let waiting = ''
let pendingStop: NodeJS.Immediate | undefined
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
function probedColumns(): number | undefined {
  const { stdout } = process
  if (!stdout.isTTY || !isatty(stdout.fd)) return undefined
  // getWindowSize reads the dimensions cached when its stream was initialized.
  let probe: WriteStream | undefined
  try {
    probe = new WriteStream(stdout.fd)
    const [columns] = probe.getWindowSize()
    return Number.isInteger(columns) && columns > 0 ? columns : undefined
  } catch {
    return undefined
  } finally {
    probe?.destroy()
  }
}
function closingOutput(): NodeJS.WriteStream {
  const { stdout } = process
  const columns = probedColumns()
  if (columns === undefined || columns === stdout.columns) return stdout
  return new Proxy(stdout, {
    get(target, property): unknown {
      if (property === 'columns') return columns
      if (property === 'write') return target.write.bind(target)
      return Reflect.get(target, property)
    }
  })
}
function restoreCursor() {
  process.stdout.write(showCursor)
}
// WHY: A stopped process gets no SIGWINCH, and Node reads the size of the terminal again only on that signal.
function refreshSize() {
  process.kill(process.pid, 'SIGWINCH')
}
// WHY: Under a launcher its shell may own the terminal by now, and it sees a stop sent only to the CLI once the CLI stops the group.
function stopStep(): boolean {
  const isCleared = isTerminalOwner()
  if (isCleared) process.stdout.write(clearIndicatorRows)
  restoreCursor()
  process.kill(isCleared ? process.pid : 0, 'SIGTSTP')
  return isCleared
}
function clearIndicator() {
  if (!active) return
  clearInterval(indicator)
  if (removeStepListeners) {
    removeStepListeners()
    removeStepListeners = undefined
    process.off('exit', restoreCursor)
    if (pendingStop) {
      // WHY: The step ended before the stop it deferred, and none of its listeners is left to make it.
      clearImmediate(pendingStop)
      pendingStop = undefined
      if (!stopStep()) process.stdout.write(clearIndicatorRows)
      refreshSize()
    } else {
      process.stdout.write(clearIndicatorRows)
      restoreCursor()
    }
  }
  indicator = undefined
  active = ''
  waiting = ''
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
type NoteText = { text: string; output: NodeJS.WriteStream }
function fitsNote({ text, output }: NoteText): boolean {
  return !wrapTextWithPrefix(output, text, notePrefix).includes('\n')
}
function pathLines({ text, output }: NoteText): string[] {
  const segments = text.split(path.sep)
  const fits = (line: string) => fitsNote({ text: line, output })
  const lines: string[] = []
  let line = ''
  for (const [index, name] of segments.entries()) {
    const segment = index < segments.length - 1 ? name + path.sep : name
    if (line && !fits(line + segment)) {
      lines.push(line)
      line = ''
    }
    const pieces = widthLines({ text: line + segment, fits })
    line = pieces.pop() ?? ''
    lines.push(...pieces)
  }
  return [...lines, line]
}
export async function confirmProject({
  summary,
  language,
  output,
  onEnd
}: Confirmation): Promise<void> {
  const m = messages[language]
  const [directory = '', ...rest] = summary.split('\n')
  const label = `${m.dir}:`
  // WHY: Clack cuts a note line that passes its width at any character, so a long path gets lines of its own that fit.
  const dir =
    directory.startsWith(`${label} `) && !fitsNote({ text: directory, output })
      ? pathLines({ text: directory.slice(label.length + 1), output })
      : []
  note(
    dir.length > 0 ? [label, ...dir, ...rest].join('\n') : summary,
    m.summary,
    {
      format: line => (dir.includes(line) ? line : noteFormat.format(line)),
      output
    }
  )
  const input = process.stdin
  // WHY: The confirm closes on y, n or Enter and leaves raw mode before the rest of the read reaches this listener, and no question comes after it to take a Ctrl+D read later.
  const stop = listenEndKey({ input, shouldIgnore: () => !input.isRaw, onEnd })
  try {
    const result = await confirm({
      message: m.create,
      active: m.yes,
      inactive: m.no,
      input,
      output
    })
    if (isCancel(result)) throw new CanceledError()
    log.message('', { spacing: 0, output })
    if (!result) throw new CanceledError()
  } finally {
    stop()
  }
}
export const progress = {
  clear: clearIndicator,
  start(title: string): void {
    active = title
    if (!process.stdout.isTTY) return
    process.once('exit', restoreCursor)
    process.stdout.write(hideCursor)
    let index = 0
    let width: number | undefined
    let drawnColumns: number | undefined
    let isRunning = true
    const interval = unicode ? unicodeIntervalMs : asciiIntervalMs
    const draw = () => {
      const mark = styleText('magenta', frames[index] ?? '')
      const columns = width ?? process.stdout.columns
      if (columns < 1) return
      const label = stepTitle({ title: waiting || title, columns })
      const line = label ? `${mark}  ${label}` : mark
      process.stdout.write(`\r\u001B[?7l${line}\u001B[?7h\r`)
      drawnColumns = columns
      index = (index + 1) % frames.length
    }
    // WHY: After a synchronous part the timer runs before the loop reads a pending Ctrl+Z, and under a launcher the shell may own the terminal by then. The frame waits until the signals are read.
    let pendingFrame: NodeJS.Immediate | undefined
    const tick = () => {
      pendingFrame = setImmediate(() => {
        pendingFrame = undefined
        if (isRunning && !pendingStop) draw()
      })
    }
    const redraw = () => {
      process.stdout.write(clearIndicatorRows)
      draw()
    }
    // WHY: Node reads the size of the terminal in a SIGWINCH listener of its own, which may run before or after this one, and reports no resize for a size that went back to the one it held during a stop.
    const resize = () => {
      width = probedColumns()
      if (width !== undefined) {
        if (drawnColumns !== width) redraw()
        return
      }
      // WHY: Without the probe the width is the one Node reads in its listener, and every listener of the signal has run by the next microtask.
      queueMicrotask(() => {
        if (drawnColumns !== process.stdout.columns) redraw()
      })
    }
    const resume = () => {
      clearImmediate(pendingStop)
      pendingStop = undefined
      process.stdout.write(hideCursor)
      refreshSize()
      // WHY: Node holds the size from before the stop until it reads that signal, and the timer of the indicator may run first.
      width = probedColumns()
      redraw()
      // WHY: The interval came due during the stop, and its frame would follow this one at once. After a stop the CLI cannot catch, that frame may already wait for its turn.
      clearImmediate(pendingFrame)
      clearInterval(indicator)
      indicator = setInterval(tick, interval)
    }
    const suspend = () => {
      // WHY: A launcher of the group stops first, so the continue of its shell may be queued behind this signal, and it cancels the stop.
      pendingStop ??= setImmediate(() => {
        pendingStop = undefined
        process.off('SIGTSTP', suspend)
        // WHY: With no SIGCONT listener during the stop its continue emits no event, so the resume() after the stop is the only restore.
        process.off('SIGCONT', resume)
        stopStep()
        process.on('SIGTSTP', suspend)
        process.on('SIGCONT', resume)
        resume()
      })
    }
    const quit = () => {
      // WHY: A launcher in the group ends at once on Ctrl+\ and its shell may write its prompt before this runs.
      if (isTerminalOwner()) process.stdout.write(clearIndicatorRows)
      restoreCursor()
      process.off('SIGQUIT', quit)
      process.kill(process.pid, 'SIGQUIT')
    }
    process.on('SIGTSTP', suspend)
    process.on('SIGCONT', resume)
    process.on('SIGQUIT', quit)
    process.on('SIGWINCH', resize)
    redrawStep = () => {
      if (isRunning && !pendingStop) redraw()
    }
    removeStepListeners = () => {
      isRunning = false
      redrawStep = undefined
      process.off('SIGWINCH', resize)
      process.off('SIGTSTP', suspend)
      process.off('SIGCONT', resume)
      process.off('SIGQUIT', quit)
    }
    draw()
    indicator = setInterval(tick, interval)
  },
  wait(title: string): void {
    waiting = title
    redrawStep?.()
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
