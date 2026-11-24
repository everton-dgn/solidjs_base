import type { Writable } from 'node:stream'

import { hideCursor, showCursor } from '../constants/cursor.ts'

type Frame = {
  lines: string[]
  row: number
  bottom: number
  screenRows: number
  columns: number
  isKnown: boolean
  stoppedRow?: number
  keptRow: number
}
type QuestionFrame<Output> = {
  output: Output
  isOpen: () => boolean
  erase: () => void
  hold: () => void
  flush: () => void
}

const escape = '\u001B'
// WHY: Clack moves by rows, erases a whole line (2K) or from the cursor down (J), always from the first column, and styles its text.
const sequence = /^\[(?:(?<count>\d*)(?<move>[ABDG])|(?<erasure>2K|J)|[\d;]*m)/u
function hasControl(text: string): boolean {
  for (const character of text) {
    if (character < ' ' && character !== '\n') return true
  }
  return false
}
// WHY: Clack counts 20 rows and wraps at 80 columns on a stream that has no size.
const defaultRows = 20
const defaultColumns = 80
function screenRows(target: Writable): number {
  return 'rows' in target && typeof target.rows === 'number'
    ? target.rows
    : defaultRows
}
function screenColumns(target: Writable): number {
  return 'columns' in target && typeof target.columns === 'number'
    ? target.columns
    : defaultColumns
}
type Text = { frame: Frame; text: string }
function addText({ frame, text }: Text): void {
  if (text) frame.stoppedRow = undefined
  for (const [index, line] of text.split('\n').entries()) {
    if (index > 0) frame.row += 1
    frame.bottom = Math.max(frame.bottom, frame.row)
    while (frame.lines.length <= frame.row) frame.lines.push('')
    frame.lines[frame.row] += line
  }
}
// WHY: At a new width Clack never draws again the rows above the screen, which the terminal keeps at the old width.
function rewrap(frame: Frame): void {
  const top = Math.max(0, frame.bottom - frame.screenRows + 1)
  frame.lines.splice(0, top)
  frame.row -= top
  frame.bottom -= top
  frame.keptRow = Math.max(0, frame.keptRow - top)
}
type Change = { frame: Frame; count?: string; move?: string; erasure?: string }
function change({ frame, count, move, erasure }: Change): void {
  const amount = count ? Number(count) : 1
  // WHY: A move up stops at the top of the screen, which is below the first row once the question has scrolled past it.
  const top = Math.max(0, frame.bottom - frame.screenRows + 1)
  // WHY: Clack never writes again a row above the top of the screen, so a change of that row never reaches the terminal, even once the screen gets taller.
  frame.keptRow = Math.max(frame.keptRow, top)
  if (move === 'A') {
    frame.stoppedRow = frame.row - amount < top ? top : undefined
    frame.row = Math.max(top, frame.row - amount)
  }
  if (move === 'B') frame.row += amount
  if (move === 'B' || erasure === '2K') frame.stoppedRow = undefined
  addText({ frame, text: '' })
  if (erasure === 'J') {
    // WHY: Clack writes again from the top of the screen only the rows it can reach, and the rows above it may be old.
    const start = frame.stoppedRow ?? 0
    frame.stoppedRow = undefined
    frame.lines.length = frame.row + 1
    frame.lines.splice(0, start)
    frame.row -= start
    frame.bottom -= start
    frame.keptRow = Math.min(Math.max(0, frame.keptRow - start), frame.row)
  }
  if (erasure) frame.lines[frame.row] = ''
}
type Chunk = { frame: Frame; chunk: string }
function apply({ frame, chunk }: Chunk): void {
  const [text = '', ...sequences] = chunk.split(escape)
  addText({ frame, text })
  let isKnown = !hasControl(text)
  for (const part of sequences) {
    const match = sequence.exec(part)
    const groups = match?.groups ?? {}
    const rest = part.slice(match?.[0].length ?? 0)
    change({ ...groups, frame })
    // WHY: A sequence with no move or erasure is a style, and it stays in the text of its line.
    const isStyle = match !== null && !groups.move && !groups.erasure
    addText({ frame, text: isStyle ? escape + part : rest })
    isKnown &&= match !== null && !hasControl(rest)
  }
  if (!isKnown) frame.isKnown = false
}

// WHY: Clack hides the cursor when it opens a question and shows it when the question closes, and between the two it draws whole lines with moves relative to the end of its last render. The lines kept here are the open question as it is on screen.
export function questionFrame<Output extends Writable>(
  target: Output
): QuestionFrame<Output> {
  let frame: Frame | undefined
  let isHeld = false
  const flush = () => {
    if (!isHeld) return
    isHeld = false
    if (!frame) return
    // WHY: Clack keeps right only the rows that were on screen when it last wrote, so the rows of a taller question above them stay in the history above what the shell wrote. A taller screen alone has Clack write nothing.
    const shown = Math.min(frame.screenRows, screenRows(target))
    const start = Math.max(frame.keptRow, frame.lines.length - shown)
    const below = frame.lines.length - 1 - frame.row
    target.write(
      frame.lines.slice(start).join('\n') +
        (below > 0 ? `${escape}[${below}A` : '')
    )
    frame.keptRow = start
    frame.bottom = frame.lines.length - 1
  }
  const record = (chunk: string) => {
    if (chunk.includes(showCursor)) {
      flush()
      frame = undefined
      return
    }
    if (frame) {
      if (screenColumns(target) !== frame.columns) {
        rewrap(frame)
        frame.columns = screenColumns(target)
      }
      frame.screenRows = screenRows(target)
      apply({ frame, chunk })
    }
    if (!frame && chunk.includes(hideCursor)) {
      frame = {
        lines: [''],
        row: 0,
        bottom: 0,
        screenRows: screenRows(target),
        columns: screenColumns(target),
        isKnown: true,
        keptRow: 0
      }
    }
  }
  const forward = target.write.bind(target)
  const write = (...args: unknown[]): unknown => {
    const [chunk, ...rest] = args
    if (typeof chunk === 'string') record(chunk)
    // WHY: An empty write still calls the callback of a write that is held back.
    return Reflect.apply(forward, undefined, isHeld ? ['', ...rest] : args)
  }
  return {
    output: new Proxy(target, {
      get(stream, property): unknown {
        return property === 'write' ? write : Reflect.get(stream, property)
      }
    }),
    isOpen: () => frame !== undefined,
    erase() {
      // WHY: A question drawn with unknown bytes stays as it is. One whose rows went above the top of the screen since Clack last wrote it from there cannot be erased whole, so it stays and its rows on screen are drawn again below what the shell writes.
      if (!frame?.isKnown || isHeld) return
      if (frame.bottom < screenRows(target)) {
        // WHY: tmux copies the screen to its history on an erase from the top left corner, and the first row of a question may be on the top row of the screen, so it is cleared alone and the rest from the row below it.
        // WHY: The rows above the first one Clack keeps right were not drawn again, and what is there may belong to the shell.
        const above = Math.max(0, frame.row - frame.keptRow)
        const up = above > 0 ? `${escape}[${above}A` : ''
        target.write(
          frame.lines.length - frame.keptRow > 1
            ? `${up}${escape}[2K${escape}[B\r${escape}[J${escape}[A`
            : `${up}\r${escape}[J`
        )
      } else {
        // WHY: When every row that changed is above the screen Clack moves the cursor up to the top of the screen and writes nothing more, where the shell would write over the question.
        const below = frame.lines.length - 1 - frame.row
        if (below > 0) target.write(`${escape}[${below}B`)
        frame.row += below
        frame.stoppedRow = undefined
      }
      isHeld = true
    },
    hold() {
      if (frame?.isKnown) isHeld = true
    },
    flush
  }
}
