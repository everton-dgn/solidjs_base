import process from 'node:process'

import {
  S_BAR,
  S_STEP_SUBMIT,
  confirm,
  isCancel,
  note,
  outro,
  log
} from '@clack/prompts'

import { messages, type Language } from './cli-language.ts'
import { CanceledError } from './usage-error.ts'

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
}: {
  summary: string
  language: Language
}): Promise<void> {
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
  fail(): void {
    if (!active) return
    const title = active
    clearIndicator()
    log.error(title, { spacing: 0 })
  }
}
export function closeFrame(reason: string): void {
  progress.fail()
  log.message(reason, { symbol: S_BAR, spacing: 0 })
  outro()
}
export function finishProject({
  steps,
  language
}: {
  steps: string[]
  language: Language
}): void {
  const m = messages[language]
  note(steps.join('\n'), m.next)
  outro(m.ready)
}
