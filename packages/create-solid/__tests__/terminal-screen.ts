import assert from 'node:assert/strict'

// A terminal of a fixed size with a history, as tmux shows it. It counts one cell per code point and keeps the rows as
// they are at a new width.
type Size = { rows: number; columns: number }
type ScreenOptions = Size & { isScrollOnClear?: boolean }
type Cursor = { row: number; column: number }
type View = { screen: string[]; history: string[]; cursor: Cursor }
type Screen = {
  write: (bytes: string) => void
  resize: (size: Size) => void
  view: () => View
}
type State = Size & {
  lines: string[][]
  history: string[]
  cursor: Cursor
  isScrollOnClear: boolean
}
type Sequence = { state: State; parameters: string; final: string }
type Cell = { state: State; cell: string }
type Height = { state: State; rows: number }

const token =
  // oxlint-disable-next-line no-control-regex
  /\u001B\[(?<parameters>[\d;?]*)(?<final>[@-~])|\n|\r|[^\n\r\u001B]/gu
// A row keeps a hole where nothing was written, and the screen shows a space there.
const text = (cells: string[]) =>
  Array.from(cells, cell => cell || ' ')
    .join('')
    .trimEnd()

function cellsOf(line: string): string[] {
  const cells: string[] = []
  for (const cell of line) cells.push(cell)
  return cells
}
function lineFeed(state: State): void {
  state.cursor.column = 0
  if (state.cursor.row < state.rows - 1) {
    state.cursor.row += 1
    return
  }
  state.history.push(text(state.lines.shift() ?? []))
  state.lines.push([])
}
// WHY: tmux waits for the next character to wrap a row that reached its last column, so a full row and a line feed take
// one row.
function writeCell({ state, cell }: Cell): void {
  if (cell === '\n') {
    lineFeed(state)
    return
  }
  if (cell === '\r') {
    state.cursor.column = 0
    return
  }
  if (state.cursor.column >= state.columns) lineFeed(state)
  const line = state.lines[state.cursor.row] ?? []
  line[state.cursor.column] = cell
  state.lines[state.cursor.row] = line
  state.cursor.column += 1
}
// WHY: tmux with scroll-on-clear copies to its history the rows of the screen down to the last one that holds text when
// the screen is erased from its top left corner.
function eraseDown(state: State): void {
  const { cursor, lines } = state
  if (state.isScrollOnClear && cursor.row === 0 && cursor.column === 0) {
    const last = lines.findLastIndex(line => text(line) !== '')
    state.history.push(...lines.slice(0, last + 1).map(line => text(line)))
  }
  lines[cursor.row] = (lines[cursor.row] ?? []).slice(0, cursor.column)
  for (let row = cursor.row + 1; row < state.rows; row += 1) lines[row] = []
}
function applySequence({ state, parameters, final }: Sequence): void {
  const count = Number(parameters) || 1
  const { cursor } = state
  const lastColumn = state.columns - 1
  switch (final) {
    case 'A': {
      cursor.row = Math.max(0, cursor.row - count)
      cursor.column = Math.min(cursor.column, lastColumn)
      break
    }
    case 'B': {
      cursor.row = Math.min(state.rows - 1, cursor.row + count)
      cursor.column = Math.min(cursor.column, lastColumn)
      break
    }
    case 'C': {
      cursor.column = Math.min(lastColumn, cursor.column + count)
      break
    }
    case 'D': {
      cursor.column = Math.max(0, Math.min(cursor.column, lastColumn) - count)
      break
    }
    case 'G': {
      cursor.column = Math.min(lastColumn, count - 1)
      break
    }
    case 'J': {
      assert.ok(parameters === '' || parameters === '0', parameters)
      eraseDown(state)
      break
    }
    case 'K': {
      assert.equal(parameters, '2')
      state.lines[cursor.row] = []
      break
    }
    case 'm': {
      break
    }
    case 'h':
    case 'l': {
      assert.equal(parameters, '?25')
      break
    }
    default: {
      assert.fail(JSON.stringify(`${parameters}${final}`))
    }
  }
}
// WHY: A shorter tmux drops the rows below the cursor first and moves the rest from the top to its history, and a taller
// one takes rows back from its history before it adds empty rows below.
function resizeRows({ state, rows }: Height): void {
  const { cursor, lines, history } = state
  if (rows < state.rows) {
    const below = Math.min(state.rows - 1 - cursor.row, state.rows - rows)
    lines.splice(state.rows - below, below)
    const needed = state.rows - rows - below
    history.push(...lines.splice(0, needed).map(line => text(line)))
    cursor.row -= needed
  } else {
    const back = Math.min(history.length, rows - state.rows)
    const taken = history.splice(history.length - back, back)
    lines.unshift(...taken.map(line => cellsOf(line)))
    cursor.row += back
  }
  state.rows = rows
  while (lines.length < rows) lines.push([])
}

export function terminalScreen({
  rows,
  columns,
  isScrollOnClear = false
}: ScreenOptions): Screen {
  const state: State = {
    rows,
    columns,
    lines: Array.from({ length: rows }, () => []),
    history: [],
    cursor: { row: 0, column: 0 },
    isScrollOnClear
  }
  return {
    write(bytes) {
      for (const match of bytes.matchAll(token)) {
        const [whole] = match
        const { parameters = '', final } = match.groups ?? {}
        if (final) applySequence({ state, parameters, final })
        else writeCell({ state, cell: whole })
      }
    },
    resize(size) {
      resizeRows({ state, rows: size.rows })
      state.columns = size.columns
    },
    view: () => ({
      screen: state.lines.map(line => text(line)),
      history: [...state.history],
      cursor: { ...state.cursor }
    })
  }
}
