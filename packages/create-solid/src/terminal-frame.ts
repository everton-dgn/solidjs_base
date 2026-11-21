import { confirm, isCancel, note, outro, log } from '@clack/prompts'

import { messages, type Language } from './cli-language.ts'
import { CanceledError } from './usage-error.ts'

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
export const progress = { start: log.step, finish: log.success }
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
