import assert from 'node:assert/strict'
import { PassThrough, type Writable } from 'node:stream'
import { setImmediate } from 'node:timers/promises'

import { isCancel, TextPrompt, wrapTextWithPrefix } from '@clack/core'

import { type Follow, questionFrame } from '../src/questionFrame/index.ts'
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
  // The frames the question frame computed from the state of the prompt so far.
  draws: () => number
}
type Asking = { input: PassThrough; output: Writable; follow?: Follow }
// The question opened, with the promise that settles once Ctrl+C has canceled it.
type Ask = (asking: Asking) => Promise<void>
type Display = { write: (bytes: string) => void }
type Opening = {
  screen: Screen
  ask: Ask
  // Bytes go to the display as the question writes them, from its opening on.
  display?: Display
  isFramed?: boolean
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
type Framing = Typing & { ask: Ask }

type Track = { bytes: string; row: number; column?: number; rows: number }
type Tracked = Cursor & { cornerErasures: number }

const marks: Record<string, string> = { error: '▲', submit: '◇', cancel: '■' }
// A text question with no limit of rows, shaped like the title question of the CLI. It marks the cursor with a block in
// plain text, so a move of the cursor changes its rows with or without colors, and shows the error only in its state.
function renderLongText(output: Writable) {
  return function render(this: TextPrompt): string {
    const heading = `│\n${marks[this.state] ?? '◆'}  Title`
    if (this.state === 'submit' || this.state === 'cancel') {
      return `${heading}\n${wrapTextWithPrefix(output, this.value ?? '', '│  ')}`
    }
    const input = this.userInput
    const value = input
      ? `${input.slice(0, this.cursor)}█${input.slice(this.cursor + 1)}`
      : '_'
    const error = this.state === 'error' ? `  ${this.error}` : ''
    return `${heading}\n${wrapTextWithPrefix(output, value, '│  ')}\n└${error}\n`
  }
}
const askText: Ask = async ({ input, output, follow }) => {
  const render = renderLongText(output)
  const prompt = new TextPrompt({
    input,
    output,
    render,
    validate: value =>
      value?.trim() ? undefined : 'Enter a title that is not only spaces.'
  })
  follow?.(() => render.call(prompt))
  const value = await prompt.prompt()
  follow?.()
  assert.ok(isCancel(value))
}
export const askTitle: Ask = async ({ input, output, follow }) => {
  await assert.rejects(
    questionnaire({
      answers,
      language: 'en',
      input,
      output,
      hasColor: false,
      ...(follow ? { follow } : {})
    }),
    CanceledError
  )
}
export type Pause = 'erase' | 'hold'
export async function turns(): Promise<void> {
  const enough = 6
  for (let turn = 0; turn < enough; turn += 1) await setImmediate()
}
// A question on a screen of the given size or on one with no size, through the question frame unless it writes straight
// to the screen.
export async function openQuestion({
  screen,
  ask,
  display,
  isFramed = true
}: Opening): Promise<Title> {
  const stream: Stream = Object.assign(new PassThrough(), screen)
  const written: string[] = []
  stream.on('data', chunk => {
    written.push(String(chunk))
    display?.write(String(chunk))
  })
  const frame = questionFrame(stream)
  const input = new PassThrough()
  let draws = 0
  // Counts the frames the question frame computes from the state of the prompt.
  const follow: Follow = next => {
    frame.follow(
      next &&
        (() => {
          draws += 1
          return next()
        })
    )
  }
  const answer = ask({
    input,
    output: isFramed ? frame.output : stream,
    ...(isFramed ? { follow } : {})
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
      const drawn = draws
      written.length = 0
      if (pause === 'erase') frame.erase()
      else frame.hold()
      const erased = [...written]
      await during?.()
      written.length = 0
      frame.flush()
      // A text question of the CLI is erased and drawn again from the state of its prompt, not from the bytes Clack wrote.
      assert.ok(draws > drawn, 'the stop computed no frame from the prompt')
      return { erased, flushed: [...written] }
    },
    async close() {
      input.write(ctrlC)
      await answer
    },
    draws: () => draws
  }
}
// The title question of the CLI, through the question frame, on a screen of the given size or on one with no size.
export async function openTitle(screen: Screen): Promise<Title> {
  return openQuestion({ screen, ask: askTitle })
}
// A text question with no limit of rows, through the question frame.
export async function openText(screen: Screen): Promise<Title> {
  return openQuestion({ screen, ask: askText })
}
// The same question written straight to the screen.
export async function openPlainText(screen: Screen): Promise<Title> {
  return openQuestion({ screen, ask: askText, isFramed: false })
}
// The question after each key, from the writes of Clack on a screen tall enough for all of it, with no question frame.
export async function questionFrames({
  columns,
  keys,
  ask
}: Framing): Promise<string[]> {
  const question = await openQuestion({
    screen: { columns, rows: tallRows },
    ask,
    isFramed: false
  })
  const frames: string[] = []
  for (const key of keys) {
    await question.press(key)
    frames.push(replay(question.written))
  }
  await question.close()
  return frames
}
export async function titleFrames(typing: Typing): Promise<string[]> {
  return questionFrames({ ...typing, ask: askTitle })
}
export async function textFrames(typing: Typing): Promise<string[]> {
  return questionFrames({ ...typing, ask: askText })
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
