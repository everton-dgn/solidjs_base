import type { Writable } from 'node:stream'

import { wrapTextWithPrefix } from '@clack/core'
import { S_BAR_END } from '@clack/prompts'

import { widthLines } from '../widthLines/index.ts'
import { wrapFrameText } from '../wrapFrameText/index.ts'

type DirectoryError = { text: string; dir?: string; output: Writable }
const indent = '   '

export function directoryError({ text, dir, output }: DirectoryError): string {
  if (!dir || !text.endsWith(dir)) return text
  const frame = wrapTextWithPrefix(output, `${S_BAR_END}  ${text}`, '')
  if (!frame.includes('\n')) return text
  const before = text.slice(0, -dir.length).trimEnd()
  if (!before) return text
  const sentence = wrapFrameText({ output, text: before })
  const ending = `${sentence.at(-1) ?? ''} ${dir}`
  const fits = (line: string) =>
    !wrapTextWithPrefix(output, line, indent).includes('\n')
  const lines =
    wrapFrameText({ output, text: ending }).length === 1
      ? [...sentence.slice(0, -1), ending]
      : [...sentence, ...widthLines({ text: dir, fits })]
  return lines.join(`\n${indent}`)
}
