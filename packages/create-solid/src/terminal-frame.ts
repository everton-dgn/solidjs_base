import { confirm, isCancel, note, outro, log } from '@clack/prompts'

import { messages, type Language } from './cli-language.ts'
import { CanceledError } from './usage-error.ts'

type Progress = {
  start: (title: string) => void
  finish: () => void
  fail: () => void
}
export async function confirmProject(
  summary: string,
  language: Language
): Promise<void> {
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
export function generationProgress(): Progress {
  let current = ''
  return {
    start(title: string) {
      if (current) log.success(current)
      current = title
      log.step(title)
    },
    finish() {
      log.success(current)
    },
    fail() {
      log.error(current)
    }
  }
}
export function finishProject(steps: string[], language: Language): void {
  const m = messages[language]
  note(steps.join('\n'), m.next)
  outro(m.ready)
}
