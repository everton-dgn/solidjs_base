import type { Writable } from 'node:stream'

import { getColumns, getRows, wrapTextWithPrefix } from '@clack/core'

import { hideCursor, showCursor } from '../constants/cursor.ts'

type Frame = { lines: string[]; row: number; isKnown: boolean }
// The rows of the open question that a stop left on the screen or in the history, and the width they have there.
type Stop = { kept: number; columns: number; isErased: boolean }
type QuestionFrame<Output> = {
  output: Output
  isOpen: () => boolean
  erase: () => void
  hold: () => void
  flush: () => void
  follow: Follow
}

const escape = '\u001B'
// WHY: Clack moves the cursor to the first column and up by the rows of its last render minus one, in a write of its own.
function isCursorMove(text: string): boolean {
  const [before, left, up, ...rest] = text.split(escape)
  return (
    before === '' &&
    left === '[999D' &&
    (up === undefined || /^\[\d+A$/u.test(up)) &&
    rest.length === 0
  )
}
// WHY: Clack moves by rows, erases a whole line (2K) or from the cursor down (J), always from the first column, and styles its text.
const sequence = /^\[(?:(?<count>\d*)(?<move>[ABDG])|(?<erasure>2K|J)|[\d;]*m)/u
type Erasure = { up: number; rows: number }
// WHY: tmux copies the screen to its history on an erase from the top left corner, and the first row of a question may be on the top row of the screen, so it is cleared alone and the rest from the row below it.
function eraseRows({ up, rows }: Erasure): string {
  const move = up > 0 ? `${escape}[${up}A` : ''
  return rows > 1
    ? `${move}${escape}[2K${escape}[B\r${escape}[J${escape}[A`
    : `${move}\r${escape}[J`
}
function hasControl(text: string): boolean {
  for (const character of text) {
    if (character < ' ' && character !== '\n') return true
  }
  return false
}
type Text = { frame: Frame; text: string }
function addText({ frame, text }: Text): void {
  for (const [index, line] of text.split('\n').entries()) {
    if (index > 0) frame.row += 1
    while (frame.lines.length <= frame.row) frame.lines.push('')
    frame.lines[frame.row] += line
  }
}
type Change = { frame: Frame; count?: string; move?: string; erasure?: string }
function change({ frame, count, move, erasure }: Change): void {
  const amount = count ? Number(count) : 1
  if (move === 'A') frame.row = Math.max(0, frame.row - amount)
  if (move === 'B') frame.row += amount
  addText({ frame, text: '' })
  if (erasure === 'J') frame.lines.length = frame.row + 1
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
  // WHY: A text question of the CLI is computed from the state of its prompt as Clack wraps it, so no row is inferred from the bytes Clack wrote.
  let draw: (() => string) | undefined
  let stop: Stop | undefined
  const exactRows = (text: string) =>
    wrapTextWithPrefix(target, text, '').split('\n')
  // WHY: The draw gives back every row the erase took from the screen, so a row that went above a shorter screen reaches the history, and at least the rows that fit, which Clack counts on screen at its next render. After a change of width the rows kept above the screen no longer match the question, so the draw gives it back whole.
  const redraw = ({
    lines,
    kept,
    columns,
    isErased
  }: Stop & { lines: string[] }) => {
    const fit = Math.min(lines.length, getRows(target))
    const isWhole = isErased && (kept === 0 || columns !== getColumns(target))
    const count = isWhole ? lines.length : Math.max(fit, lines.length - kept)
    target.write(lines.slice(-count).join('\n'))
  }
  const flush = (ending = '') => {
    if (!isHeld) return
    isHeld = false
    if (!frame) return
    if (draw && stop) {
      redraw({ ...stop, lines: exactRows(draw() + ending) })
      stop = undefined
      return
    }
    // WHY: Clack counts on the screen only the last rows of a question that fit it.
    const start = Math.max(0, frame.lines.length - getRows(target))
    const below = frame.lines.length - 1 - frame.row
    target.write(
      frame.lines.slice(start).join('\n') +
        (below > 0 ? `${escape}[${below}A` : '')
    )
  }
  const record = (chunk: string) => {
    if (chunk.includes(showCursor)) {
      // WHY: Clack ends a question with a new line before it shows the cursor.
      flush('\n')
      frame = undefined
      return
    }
    if (frame) apply({ frame, chunk })
    if (!frame && chunk.includes(hideCursor)) {
      frame = { lines: [''], row: 0, isKnown: true }
    }
  }
  const forward = target.write.bind(target)
  // WHY: Every render of Clack starts by moving the cursor up from the end of the question, and one that changed only rows above the screen ends there, with the cursor at the top of the screen, where the shell of a stop would write over the question. The move waits for the next write of the same render and is dropped when none comes; Clack moves up again from wherever the cursor is at its next render.
  let moveUp: { chunk: string } | undefined
  const write = (...args: unknown[]): unknown => {
    const [chunk, ...rest] = args
    if (typeof chunk === 'string') record(chunk)
    // WHY: An empty write still calls the callback of a write that is held back.
    if (isHeld) return Reflect.apply(forward, undefined, ['', ...rest])
    const waiting = moveUp
    moveUp = undefined
    const text = typeof chunk === 'string' && rest.length === 0 ? chunk : ''
    if (draw && frame && isCursorMove(text)) {
      const move = { chunk: text }
      moveUp = move
      queueMicrotask(() => {
        if (moveUp === move) moveUp = undefined
      })
      return true
    }
    if (!waiting) return Reflect.apply(forward, undefined, args)
    forward(waiting.chunk)
    // WHY: Clack erases from the top left corner of the screen, where its move up stops on a question that fills it, and a move of at least one row leaves the cursor above the last row of the screen.
    const isErasure = text === `${escape}[J` && waiting.chunk.endsWith('A')
    return isErasure
      ? forward(eraseRows({ up: 0, rows: 2 }))
      : Reflect.apply(forward, undefined, args)
  }
  return {
    output: new Proxy(target, {
      get(stream, property): unknown {
        return property === 'write' ? write : Reflect.get(stream, property)
      }
    }),
    isOpen: () => frame !== undefined,
    erase() {
      // WHY: A question drawn with unknown bytes stays as it is.
      if (!frame?.isKnown || isHeld) return
      if (draw) {
        // WHY: Clack leaves the cursor at the end of the question, and the rows of a question taller than the screen above its top are in the history, where no erase reaches.
        const lines = exactRows(draw())
        const shown = Math.min(lines.length, getRows(target))
        target.write(eraseRows({ up: shown - 1, rows: shown }))
        stop = {
          kept: lines.length - shown,
          columns: getColumns(target),
          isErased: true
        }
        isHeld = true
        return
      }
      // WHY: The questions that are not text questions of the CLI fit on the screen, so all of their rows are on it.
      target.write(eraseRows({ up: frame.row, rows: frame.lines.length }))
      isHeld = true
    },
    hold() {
      if (!frame?.isKnown) return
      // WHY: A held question stays whole on the screen or in the history.
      if (draw && !isHeld) {
        const lines = exactRows(draw())
        stop = {
          kept: lines.length,
          columns: getColumns(target),
          isErased: false
        }
      }
      isHeld = true
    },
    flush: () => {
      flush()
    },
    follow(next) {
      draw = next
    }
  }
}
export type Follow = (draw?: () => string) => void
