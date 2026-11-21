import process from 'node:process'
import { styleText } from 'node:util'

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

type Confirmation = {
  summary: string
  language: Language
}

const frames = S_BAR === '│' ? ['◒', '◐', '◓', '◑'] : ['•', 'o', 'O', '0']
const unicodeIntervalMs = 80
const asciiIntervalMs = 120
const echoWidth = 2
let indicator: ReturnType<typeof setInterval> | undefined
let active = ''
function stepTitle(title: string, columns = process.stdout.columns): string {
  const prefixWidth = 3
  if (!Number.isFinite(columns)) return title
  const width = Math.max(0, columns - prefixWidth)
  if (title.length <= width) return title
  const ellipsis = (unicode ? '…' : '...').slice(0, width)
  return title.slice(0, width - ellipsis.length) + ellipsis
}
function clearIndicator() {
  if (!active) return
  clearInterval(indicator)
  if (indicator) process.stdout.write('\r\u001B[2K')
  indicator = undefined
  active = ''
}
export async function confirmProject({
  summary,
  language
}: Confirmation): Promise<void> {
  const m = messages[language]
  note(summary, m.summary)
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
  start(title: string): void {
    active = title
    if (!process.stdout.isTTY) return
    let index = 0
    const draw = () => {
      const mark = styleText('magenta', frames[index] ?? '')
      const columns = process.stdout.columns - echoWidth
      if (columns < 1) return
      const label = stepTitle(title, columns)
      process.stdout.write(label ? `\r${mark}  ${label}` : `\r${mark}`)
      index = (index + 1) % frames.length
    }
    draw()
    indicator = setInterval(draw, unicode ? unicodeIntervalMs : asciiIntervalMs)
  },
  finish: (title: string): void => {
    clearIndicator()
    log.step(stepTitle(title), { spacing: 0 })
  },
  warn(message: string): void {
    clearIndicator()
    const [title = '', ...diagnostic] = message.split('\n')
    log.warn(
      [
        stepTitle(title),
        ...diagnostic.flatMap(line =>
          wrapFrameText({ output: process.stdout, text: line })
        )
      ].join('\n'),
      { spacing: 0 }
    )
  },
  error(title: string): void {
    clearIndicator()
    log.message(stepTitle(title), {
      symbol: styleText('red', S_STEP_ERROR),
      spacing: 0
    })
  },
  cancel(): void {
    if (!active) return
    const title = active
    clearIndicator()
    log.error(stepTitle(title), { spacing: 0 })
  }
}
export function closeQuestion(label: string): void {
  outro(`${styleText('gray', S_BAR_END)}  ${label}`, { withGuide: false })
}
export function closeFrame(reason: string, closing?: string): void {
  if (reason) {
    log.message(wrapFrameText({ output: process.stdout, text: reason }), {
      spacing: 0
    })
  }
  outro(closing)
}
export function finishProject({ steps, language }: Completion): void {
  const m = messages[language]
  note(steps.join('\n'), m.next)
  outro(m.ready)
}
