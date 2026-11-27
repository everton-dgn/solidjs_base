import type { Writable } from 'node:stream'

import { wrapTextWithPrefix } from '@clack/core'

type FrameText = { output: Writable; text: string }

export function wrapFrameText({ output, text }: FrameText): string[] {
  const prefix = '   '
  return text.split('\n').flatMap(paragraph => {
    const lines = wrapTextWithPrefix(output, paragraph, prefix).split('\n')
    return lines.map((row, index) => {
      const content = row.slice(prefix.length)
      const start = index === 0 ? content : content.trimStart()
      return index === lines.length - 1 ? start : start.trimEnd()
    })
  })
}
