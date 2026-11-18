import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const BLOCK = [
  '<!--SOLID BASE START-->',
  'This application uses the Solid Base packages. Before changing code, run `vp run doctor`.',
  'If the Vite config fails to load, run `node --input-type=module -e "import \'@evertondgn/solid-tooling/cli\'" -- solid-tooling doctor --root .`.',
  'The report lists installed versions, skills to read, missing dependencies and validation commands.',
  '<!--SOLID BASE END-->'
]
// The reader refuses instead of parsing Markdown. A marker is only ours when
// CommonMark reads its line as a comment of its own, and a line above it that
// can open a code fence or a raw HTML block could swallow it. A fence always
// holds a run of three backticks or tildes; a raw HTML block that can hold a
// column-zero line starts its own line, outside any list or quote.
const FENCE_RUN = /`{3}|~{3}/u
const RAW_HTML_OPENER =
  /^[\s>*+\-\d.)]*<(?:(?:pre|script|style|textarea)(?:[\s>]|$)(?!.*<\/(?:pre|script|style|textarea)>)|!--(?!.*-->)|\?(?!.*\?>)|![a-z](?!.*>)|!\[CDATA\[(?!.*\]\]>))/iu
type BlockState = 'current' | 'outdated' | 'missing'
type Edge = 'START' | 'END'
type Instructions = { original: string; file: string }
type MarkerPair = { start: number; end: number }
type AgentsInput = { root: string; shouldWrite: boolean }
type MarkerLine = { line: string; location: string }

async function readInstructions(file: string): Promise<string> {
  try {
    const bytes = await readFile(file)
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      bytes
    )
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return ''
    }
    throw error
  }
}
function readMarker({ line, location }: MarkerLine): Edge | undefined {
  const marker = /<!--SOLID BASE (?<edge>START|END)-->/u.exec(line)
  if (!marker) {
    if (/<!--\s*SOLID BASE\s+(?:START|END)\b/iu.test(line)) {
      throw new Error(`${location}: malformed marker`)
    }
    return undefined
  }
  if (marker[0] !== line) throw new Error(`${location}: invalid marker`)
  return marker.groups?.edge === 'START' ? 'START' : 'END'
}
function markers({ original, file }: Instructions): MarkerPair | undefined {
  const lines = original.match(/[^\n]*\n|[^\n]+$/gu) ?? []
  let pair: MarkerPair | undefined
  let isOpen = false
  let startLine = 0
  let openerLine = 0
  let offset = 0
  for (const [index, raw] of lines.entries()) {
    const line = raw.replace(/\r?\n$/u, '')
    const location = `${file}:${index + 1}`
    const edge = readMarker({ line, location })
    if (edge && openerLine) {
      throw new Error(
        `${location}: SOLID BASE marker below line ${openerLine}, which can open a code or HTML block; move the block to the top of the file`
      )
    }
    if (edge && (edge === 'START' ? isOpen || pair !== undefined : !isOpen)) {
      throw new Error(`${location}: invalid marker`)
    }
    if (edge === 'START') {
      pair = { start: offset, end: offset }
      startLine = index + 1
    }
    if (edge === 'END' && pair) pair.end = offset + line.length
    if (edge) isOpen = edge === 'START'
    if (
      !edge &&
      !openerLine &&
      (FENCE_RUN.test(line) || RAW_HTML_OPENER.test(line))
    ) {
      openerLine = index + 1
    }
    offset += raw.length
  }
  if (isOpen) throw new Error(`${file}:${startLine}: missing end marker`)
  return pair
}
export async function agents({
  root,
  shouldWrite
}: AgentsInput): Promise<BlockState> {
  const file = path.join(root, 'AGENTS.md')
  const original = await readInstructions(file)
  const pair = markers({ original, file })
  const eol = original.includes('\r\n') ? '\r\n' : '\n'
  const block = BLOCK.join(eol)
  // A new block goes to the top, where no line above it can hide it.
  const top = original.startsWith('﻿') ? 1 : 0
  const updated = pair
    ? original.slice(0, pair.start) + block + original.slice(pair.end)
    : original.slice(0, top) + block + eol + original.slice(top)
  if (shouldWrite && updated !== original) await writeFile(file, updated)
  if (updated === original) return 'current'
  return pair ? 'outdated' : 'missing'
}
