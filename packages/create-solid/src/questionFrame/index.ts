import type { Writable } from 'node:stream'

type Frame = { lines: string[]; row: number; isKnown: boolean }
type QuestionFrame<Output> = {
  output: Output
  isOpen: () => boolean
  erase: () => void
  flush: () => void
}

const escape = '\u001B'
const showCursor = `${escape}[?25h`
const hideCursor = `${escape}[?25l`
// WHY: Clack moves by rows, erases a whole line (2K) or from the cursor down (J), always from the first column, and styles its text.
const sequence = /^\[(?:(?<count>\d*)(?<move>[ABDG])|(?<erasure>2K|J)|[\d;]*m)/u
function hasControl(text: string): boolean {
  for (const character of text) {
    if (character < ' ' && character !== '\n') return true
  }
  return false
}
function addText(frame: Frame, text: string): void {
  for (const [index, line] of text.split('\n').entries()) {
    if (index > 0) frame.row += 1
    while (frame.lines.length <= frame.row) frame.lines.push('')
    frame.lines[frame.row] += line
  }
}
type Change = { count?: string; move?: string; erasure?: string }
function change(frame: Frame, { count, move, erasure }: Change): void {
  const amount = count ? Number(count) : 1
  if (move === 'A') frame.row = Math.max(0, frame.row - amount)
  if (move === 'B') frame.row += amount
  addText(frame, '')
  if (erasure === 'J') frame.lines.length = frame.row + 1
  if (erasure) frame.lines[frame.row] = ''
}
function apply(frame: Frame, chunk: string): void {
  const [text = '', ...sequences] = chunk.split(escape)
  addText(frame, text)
  let isKnown = !hasControl(text)
  for (const part of sequences) {
    const match = sequence.exec(part)
    const groups = match?.groups ?? {}
    const rest = part.slice(match?.[0].length ?? 0)
    change(frame, groups)
    // WHY: A sequence with no move or erasure is a style, and it stays in the text of its line.
    const isStyle = match !== null && !groups.move && !groups.erasure
    addText(frame, isStyle ? escape + part : rest)
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
    const below = frame.lines.length - 1 - frame.row
    target.write(
      frame.lines.join('\n') + (below > 0 ? `${escape}[${below}A` : '')
    )
  }
  const record = (chunk: string) => {
    if (chunk.includes(showCursor)) {
      flush()
      frame = undefined
      return
    }
    if (frame) apply(frame, chunk)
    if (!frame && chunk.includes(hideCursor)) {
      frame = { lines: [''], row: 0, isKnown: true }
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
      const rows = 'rows' in target ? Number(target.rows) : Infinity
      // WHY: A move up stops at the top of the screen, so a question taller than the screen or drawn with unknown bytes stays as it is.
      if (!frame?.isKnown || isHeld || frame.row >= rows) return
      target.write(
        `${frame.row > 0 ? `${escape}[${frame.row}A` : ''}\r${escape}[J`
      )
      isHeld = true
    },
    flush
  }
}
