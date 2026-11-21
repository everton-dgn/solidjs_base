import process from 'node:process'
import { styleText } from 'node:util'

import {
  S_BAR,
  S_STEP_SUBMIT,
  S_STEP_ERROR,
  confirm,
  isCancel,
  note,
  outro,
  log
} from '@clack/prompts'

import { messages, type Language } from './cli-language.ts'
import { CanceledError } from './usage-error.ts'

type Completion = {
  steps: string[]
  language: Language
}

type Confirmation = {
  summary: string
  language: Language
}

const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const intervalMs = 90
let indicator: ReturnType<typeof setInterval> | undefined
let active = ''
function clearIndicator() {
  if (!active) return
  clearInterval(indicator)
  process.stdout.write('\r\u001B[2K')
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
  if (result === false || isCancel(result)) {
    throw new CanceledError()
  }
}
export const progress = {
  start(title: string): void {
    active = title
    let index = 0
    const draw = () => {
      process.stdout.write(`\r${frames[index]}  ${title}`)
      index = (index + 1) % frames.length
    }
    draw()
    indicator = setInterval(draw, intervalMs)
  },
  finish: (title: string): void => {
    clearIndicator()
    log.message(title, { symbol: S_STEP_SUBMIT, spacing: 0 })
  },
  warn(title: string): void {
    clearIndicator()
    log.warn(title, { spacing: 0 })
  },
  error(title: string): void {
    clearIndicator()
    log.message(title, { symbol: styleText('red', S_STEP_ERROR), spacing: 0 })
  },
  cancel(): void {
    if (!active) return
    const title = active
    clearIndicator()
    log.error(title, { spacing: 0 })
  }
}
export function closeFrame(reason: string, closing?: string): void {
  if (reason) log.message(reason, { symbol: S_BAR, spacing: 0 })
  outro(closing)
}
export function finishProject({ steps, language }: Completion): void {
  const m = messages[language]
  note(steps.join('\n'), m.next)
  outro(m.ready)
}
