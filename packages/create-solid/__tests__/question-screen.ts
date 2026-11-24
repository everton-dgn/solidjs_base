import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { setImmediate } from 'node:timers/promises'

import { questionFrame } from '../src/questionFrame/index.ts'
import { questionnaire } from '../src/questionnaire.ts'
import { CanceledError } from '../src/usage-error.ts'

const escape = '\u001B'
const hide = `${escape}[?25l`
const ctrlC = '\u0003'
// The directory is not on disk, so the title question of the CLI opens first, with the name of the directory as its placeholder.
const answers = { name: 'pilot-app' }
// A screen this tall holds every question of the tests, so Clack keeps every row of it right.
const tallRows = 1000

type Stop = { erased: string[]; flushed: string[] }
type Screen = { columns?: number; rows?: number }
type Stream = PassThrough & Screen
type Title = {
  stream: Stream
  written: string[]
  frame: ReturnType<typeof questionFrame<Stream>>
  press: (key: string) => Promise<void>
  resize: (width: number) => Promise<void>
  heighten: (height: number) => Promise<void>
  stop: (pause: Pause, during?: () => Promise<void>) => Promise<Stop>
  close: () => Promise<void>
}

const token =
  // oxlint-disable-next-line no-control-regex
  /\u001B\[(?<parameters>[\d;?]*)(?<final>[@-~])|\n|\r|[^\n\r\u001B]+/gu
type Cursor = { row: number; column: number }
type Page = Cursor & { rows: string[] }
type Text = { page: Page; text: string }
function writeText({ page, text }: Text): void {
  const line = page.rows[page.row] ?? ''
  page.rows[page.row] =
    line.padEnd(page.column).slice(0, page.column) +
    text +
    line.slice(page.column + text.length)
  page.column += text.length
}
type Sequence = { page: Page; parameters: string; final: string }
function applySequence({ page, parameters, final }: Sequence): void {
  const count = Number(parameters) || 1
  const line = page.rows[page.row] ?? ''
  if (final === 'A') page.row = Math.max(0, page.row - count)
  else if (final === 'B') page.row += count
  else if (final === 'D') page.column = Math.max(0, page.column - count)
  else if (final === 'G') page.column = count - 1
  else if (final === 'K' && parameters === '2') page.rows[page.row] = ''
  else if (final === 'J') {
    page.rows[page.row] = line.slice(0, page.column)
    page.rows.length = page.row + 1
  } else if (final === 'h' || final === 'l') assert.equal(parameters, '?25')
  else assert.fail(JSON.stringify(`${parameters}${final}`))
}
// The rows of the last question opened in the writes, replayed on a screen tall enough for all of it, from the row where
// Clack hid the cursor to the row of the cursor.
function replay(written: string[]): string {
  const start = written.findLastIndex(chunk => chunk.includes(hide))
  const page: Page = { rows: [''], row: 0, column: 0 }
  for (const chunk of written.slice(start + 1)) {
    for (const match of chunk.matchAll(token)) {
      const [whole] = match
      const { parameters = '', final } = match.groups ?? {}
      while (page.rows.length <= page.row) page.rows.push('')
      if (whole === '\n') {
        page.row += 1
        page.column = 0
      } else if (whole === '\r') page.column = 0
      else if (!final || final === 'm') writeText({ page, text: whole })
      else applySequence({ page, parameters, final })
    }
  }
  while (page.rows.length <= page.row) page.rows.push('')
  return page.rows.slice(0, page.row + 1).join('\n')
}

type Typing = { columns: number; keys: string[] }

type Track = { bytes: string; row: number; column?: number; rows: number }
type Tracked = Cursor & { cornerErasures: number }

export type Pause = 'erase' | 'hold'
export async function turns(): Promise<void> {
  const enough = 6
  for (let turn = 0; turn < enough; turn += 1) await setImmediate()
}
// The title question of the CLI, through the question frame, on a screen of the given size or on one with no size.
export async function openTitle(screen: Screen): Promise<Title> {
  const stream: Stream = Object.assign(new PassThrough(), screen)
  const written: string[] = []
  stream.on('data', chunk => written.push(String(chunk)))
  const frame = questionFrame(stream)
  const input = new PassThrough()
  const answer = questionnaire({
    answers,
    language: 'en',
    input,
    output: frame.output,
    hasColor: false,
    follow: frame.follow
  })
  await turns()
  return {
    stream,
    written,
    frame,
    async press(key) {
      input.write(key)
      await turns()
    },
    async resize(width) {
      stream.columns = width
      stream.emit('resize')
      await turns()
    },
    async heighten(height) {
      stream.rows = height
      stream.emit('resize')
      await turns()
    },
    async stop(pause, during) {
      written.length = 0
      if (pause === 'erase') frame.erase()
      else frame.hold()
      const erased = [...written]
      await during?.()
      written.length = 0
      frame.flush()
      return { erased, flushed: [...written] }
    },
    async close() {
      input.write(ctrlC)
      await assert.rejects(answer, CanceledError)
    }
  }
}
// The title question after each key, from the writes of Clack on a screen tall enough for all of it, with no question frame.
export async function titleFrames({
  columns,
  keys
}: Typing): Promise<string[]> {
  const stream = Object.assign(new PassThrough(), { columns, rows: tallRows })
  const written: string[] = []
  stream.on('data', chunk => written.push(String(chunk)))
  const input = new PassThrough()
  const answer = questionnaire({
    answers,
    language: 'en',
    input,
    output: stream,
    hasColor: false
  })
  await turns()
  const frames: string[] = []
  for (const key of keys) {
    input.write(key)
    await turns()
    frames.push(replay(written))
  }
  input.write(ctrlC)
  await assert.rejects(answer, CanceledError)
  return frames
}
// Follows the cursor of a terminal with this many rows: a move stops at its top and bottom rows, and a new line on its
// last row scrolls. Counts the erasures to the end of the screen that start from its top left corner.
export function track({ bytes, row, column = 0, rows }: Track): Tracked {
  let at = { row, column }
  let cornerErasures = 0
  for (const match of bytes.matchAll(token)) {
    const [whole] = match
    const { parameters = '', final } = match.groups ?? {}
    const count = Number(parameters) || 1
    if (final === 'A') at.row = Math.max(0, at.row - count)
    else if (final === 'B') at.row = Math.min(rows - 1, at.row + count)
    else if (final === 'D') at.column = Math.max(0, at.column - count)
    else if (final === 'G') at.column = count - 1
    else if (final === 'J' && at.row === 0 && at.column === 0) {
      cornerErasures += 1
    } else if (whole === '\n') {
      at = { row: Math.min(rows - 1, at.row + 1), column: 0 }
    } else if (whole === '\r') at.column = 0
    else if (!final) at.column += whole.length
  }
  return { ...at, cornerErasures }
}
