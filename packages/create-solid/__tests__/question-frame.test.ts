import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { it } from 'node:test'
import { setImmediate } from 'node:timers/promises'

import { multiselect, text } from '@clack/prompts'

import { questionFrame } from '../src/questionFrame/index.ts'

const escape = '\u001B'
const hide = `${escape}[?25l`
const show = `${escape}[?25h`
const rows = 24
// The screen of the questions that grow past it, short enough for a value of a few rows.
const tableRows = 6
function terminal() {
  const written: string[] = []
  const stream = Object.assign(new PassThrough(), { columns: 80, rows })
  stream.on('data', chunk => written.push(String(chunk)))
  return { stream, written }
}
// tmux copies the screen to its history on an erase from the top left corner, so the first row of a question is cleared
// alone and the rest from the row below it.
function erasure(up: number): string {
  return `${escape}[${up}A${escape}[2K${escape}[B\r${escape}[J${escape}[A`
}
async function turns(): Promise<void> {
  const enough = 6
  for (let turn = 0; turn < enough; turn += 1) await setImmediate()
}

void it('erases and draws again the text question Clack has on screen', async () => {
  const { stream, written } = terminal()
  const frame = questionFrame(stream)
  const input = new PassThrough()
  const answer = text({ message: 'Title', input, output: frame.output })
  await turns()
  input.write('ab')
  await turns()
  assert.equal(frame.isOpen(), true)
  written.length = 0
  frame.erase()
  const drawn = '│\n◆  Title\n│  abc█\n└\n'
  // The cursor is on the row below the last row of the question.
  const erased = erasure(drawn.split('\n').length - 1)
  assert.deepEqual(written, [erased])
  input.write('c')
  await turns()
  assert.deepEqual(written, [erased])
  frame.flush()
  assert.deepEqual(written, [erased, drawn])
  frame.flush()
  assert.deepEqual(written, [erased, drawn])
  input.write('\r')
  assert.equal(await answer, 'abc')
  assert.equal(frame.isOpen(), false)
})

void it('draws a held question before the bytes that close it', async () => {
  const { stream, written } = terminal()
  const frame = questionFrame(stream)
  const input = new PassThrough()
  const answer = text({ message: 'Title', input, output: frame.output })
  await turns()
  frame.erase()
  written.length = 0
  input.write('ab\r')
  assert.equal(await answer, 'ab')
  await turns()
  const closed = ['│\n◇  Title\n│  ab\n', show]
  assert.deepEqual(written, closed)
  frame.flush()
  frame.erase()
  assert.deepEqual(written, closed)
})

void it('keeps the rows of a multiple selection through its renders', async () => {
  const { stream, written } = terminal()
  const frame = questionFrame(stream)
  const input = new PassThrough()
  const options = ['one', 'two', 'three'].map(value => ({ value }))
  const answer = multiselect({
    message: 'Pick',
    options,
    initialValues: ['one', 'two', 'three'],
    input,
    output: frame.output
  })
  await turns()
  input.write(' ')
  await turns()
  const [opening = '', first = ''] = written
  assert.equal(opening, hide)
  frame.erase()
  written.length = 0
  frame.flush()
  const [drawn = ''] = written
  assert.equal(drawn.split('\n').length, first.split('\n').length)
  assert.match(drawn, /◻ one\n.*◼ two\n.*◼ three\n/su)
  input.write('\r')
  assert.deepEqual(await answer, ['two', 'three'])
})

void it('holds a question without erasing it and draws it again on the flush', () => {
  const { stream, written } = terminal()
  const frame = questionFrame(stream)
  frame.output.write(hide)
  frame.output.write('one\ntwo\n')
  written.length = 0
  frame.hold()
  frame.output.write(`${escape}[999D${escape}[2A${escape}[J`)
  frame.output.write('three\n')
  assert.deepEqual(written, [])
  frame.flush()
  assert.deepEqual(written, ['three\n'])
})

// When every row that changed is above the screen Clack writes only its move up, and the cursor stays there.
void it('erases a question from its first row alone when Clack left the cursor on that row', () => {
  const { stream, written } = terminal()
  const frame = questionFrame(stream)
  frame.output.write(hide)
  frame.output.write('one\ntwo\n')
  frame.output.write(`${escape}[999D${escape}[2A`)
  written.length = 0
  frame.erase()
  assert.deepEqual(written, [`${escape}[2K${escape}[B\r${escape}[J${escape}[A`])
})

void it('moves the cursor to the end of a question that stays on screen when Clack left it at the top of the screen', () => {
  const { stream, written } = terminal()
  const frame = questionFrame(stream)
  // The question has this many rows above the top of the screen.
  const rowsOver = 2
  const taller = rows + rowsOver
  frame.output.write(hide)
  frame.output.write('a\n'.repeat(taller))
  frame.output.write(`${escape}[999D${escape}[${taller}A`)
  written.length = 0
  frame.erase()
  // The top of the screen is rows - 1 rows above the end of the question.
  assert.deepEqual(written, [`${escape}[${rows - 1}B`])
  written.length = 0
  frame.flush()
  assert.deepEqual(written, ['a\n'.repeat(rows - 1)])
})

// WHY: Only the identity of the callback is checked.
const done = () => true
void it('forwards every argument of a write and keeps the callback of a held one', () => {
  const calls: unknown[][] = []
  const stream = Object.assign(new PassThrough(), { columns: 80, rows })
  stream.write = (...args: unknown[]) => calls.push(args) > 0
  const frame = questionFrame(stream)
  frame.output.write('plain', 'utf8', done)
  frame.output.write(hide)
  frame.output.write('question\n')
  frame.erase()
  frame.output.write('held', 'utf8', done)
  assert.deepEqual(calls, [
    ['plain', 'utf8', done],
    [hide],
    ['question\n'],
    [erasure(1)],
    ['', 'utf8', done]
  ])
})

void it('leaves a question as it is when its bytes are unknown', () => {
  for (const drawing of [`a${escape}[2;3Hb`, 'a\rb']) {
    const { stream, written } = terminal()
    const frame = questionFrame(stream)
    frame.output.write(hide)
    frame.output.write(drawing)
    written.length = 0
    frame.erase()
    frame.output.write('more')
    frame.flush()
    assert.deepEqual(written, ['more'], JSON.stringify(drawing))
  }
})

void it('holds a question whose first row left the top and draws the rows on screen on the flush', () => {
  const { stream, written } = terminal()
  const frame = questionFrame(stream)
  frame.output.write(hide)
  frame.output.write('a\n'.repeat(rows))
  written.length = 0
  frame.erase()
  frame.output.write('more')
  assert.deepEqual(written, [])
  frame.flush()
  assert.deepEqual(written, [`${'a\n'.repeat(rows - 1)}more`])
})

void it('counts the 20 rows of Clack on a stream that has no size', () => {
  const written: string[] = []
  const stream = new PassThrough()
  stream.on('data', chunk => written.push(String(chunk)))
  const frame = questionFrame(stream)
  const clackRows = 20
  frame.output.write(hide)
  frame.output.write('a\n'.repeat(clackRows))
  written.length = 0
  frame.erase()
  assert.deepEqual(written, [])
  frame.flush()
  assert.deepEqual(written, ['a\n'.repeat(clackRows - 1)])
})

void it('draws the rows on screen of a question taller than the screen after the renders of Clack', async () => {
  const stream = Object.assign(new PassThrough(), { columns: 20, rows: 6 })
  const written: string[] = []
  stream.on('data', chunk => written.push(String(chunk)))
  const frame = questionFrame(stream)
  const input = new PassThrough()
  const answer = text({ message: 'Title', input, output: frame.output })
  await turns()
  const first = 'xxxxxxxxxxxxxxxxx'
  const row = 'xxxxxxxxxxxxxxxxxxxx'
  const typed = `${first}${row}${row}xxx`
  input.write(typed)
  await turns()
  input.write('y')
  await turns()
  frame.erase()
  written.length = 0
  frame.flush()
  // Clack cuts the value at the width of the screen, so its rows after the first have no bar.
  const lines = ['│', '◆  Title', `│  ${first}`, row, row, 'xxxy█', '└', '']
  assert.deepEqual(written, [lines.slice(-stream.rows).join('\n')])
  input.write('\r')
  assert.equal(await answer, `${typed}y`)
})

void it('erases a question that was taller than the screen once its value is erased until it fits', async () => {
  const typedLength = 60
  const keptLength = 30
  // The value starts after the bar and two spaces, in a screen of 20 columns.
  const firstRowWidth = 17
  const backspace = '\u007F'
  const eraseLine = '\u0015'
  const kept = 'x'.repeat(keptLength)
  // Clack cuts the value at the width of the screen and draws an empty one as a placeholder.
  for (const [keys, value, valueRows] of [
    [
      backspace.repeat(typedLength - keptLength),
      kept,
      [`│  ${kept.slice(0, firstRowWidth)}`, `${kept.slice(firstRowWidth)}█`]
    ],
    [eraseLine, '', ['│  _']]
  ] as const) {
    const stream = Object.assign(new PassThrough(), {
      columns: 20,
      rows: tableRows
    })
    const written: string[] = []
    stream.on('data', chunk => written.push(String(chunk)))
    const frame = questionFrame(stream)
    const input = new PassThrough()
    const answer = text({ message: 'Title', input, output: frame.output })
    await turns()
    input.write('x'.repeat(typedLength))
    await turns()
    for (const key of keys) {
      input.write(key)
      await turns()
    }
    const question = ['│', '◆  Title', ...valueRows, '└', '']
    written.length = 0
    frame.erase()
    // The question starts on the top row of the screen whether it fills it or not.
    const erased = erasure(question.length - 1)
    assert.deepEqual(written, [erased], JSON.stringify(keys))
    frame.flush()
    assert.deepEqual(
      written,
      [erased, question.join('\n')],
      JSON.stringify(keys)
    )
    input.write('\r')
    assert.equal(await answer, value)
  }
})

const firstColumns = 30
// A question shorter than the screen keeps one row of value, so growing reaches it with a second letter.
const shortLength = 2
// A question that shrinks starts this many rows taller than the screen.
const rowsAbove = 3
const roundCount = 2
const columnsAfter = { same: 30, narrower: 20, wider: 40 } as const
type Direction = 'growing' | 'shrinking'
type Pause = 'erase' | 'hold'
type Cell = {
  height: number
  direction: Direction
  isRightAfter: boolean
  width: keyof typeof columnsAfter
  pause: Pause
}
type Opening = { value: string; columns: number }
// WHY: Clack draws a question that opens with a value whole, with the cursor at its end, so its first frame is the question as Clack has it.
async function firstFrame({ value, columns }: Opening): Promise<string> {
  const stream = Object.assign(new PassThrough(), { columns, rows: tableRows })
  const written: string[] = []
  stream.on('data', chunk => written.push(String(chunk)))
  const input = new PassThrough()
  const answer = text({
    message: 'Title',
    input,
    output: stream,
    initialValue: value
  })
  await turns()
  input.write('\r')
  await answer
  const [, frame = ''] = written
  return frame
}
type Value = { length: number; columns: number }
const drawnQuestions = new Map<string, string>()
async function drawnQuestion({ length, columns }: Value): Promise<string> {
  const key = `${columns}:${length}`
  const known = drawnQuestions.get(key)
  if (known !== undefined) return known
  const frame = await firstFrame({ value: 'x'.repeat(length), columns })
  drawnQuestions.set(key, frame)
  return frame
}
type Height = { height: number; columns: number }
async function valueLengths({ height, columns }: Height): Promise<number[]> {
  const longest = 260
  const found: number[] = []
  for (let length = 1; length <= longest; length += 1) {
    const frame = await drawnQuestion({ length, columns })
    if (frame.split('\n').length === height) found.push(length)
  }
  return found
}
type Round = { erased: string[]; flushed: string[]; length: number }
async function stopAround(cell: Cell): Promise<Round[]> {
  const columns = columnsAfter[cell.width]
  const stream = Object.assign(new PassThrough(), {
    columns: firstColumns,
    rows: tableRows
  })
  const written: string[] = []
  stream.on('data', chunk => written.push(String(chunk)))
  const frame = questionFrame(stream)
  const input = new PassThrough()
  const answer = text({ message: 'Title', input, output: frame.output })
  await turns()
  const isGrowing = cell.direction === 'growing'
  const step = isGrowing ? 1 : -1
  const lengths = await valueLengths({ height: cell.height, columns })
  const firstLength = cell.height < tableRows ? shortLength : (lengths[0] ?? 0)
  const reached = isGrowing ? firstLength : (lengths.at(-1) ?? 0)
  const before = reached - step
  const [tall = 0] = await valueLengths({
    height: tableRows + rowsAbove,
    columns: firstColumns
  })
  const typed = isGrowing ? before : Math.max(tall, before)
  input.write('x'.repeat(typed))
  await turns()
  input.write('\u007F'.repeat(typed - before))
  await turns()
  const resize = async () => {
    if (cell.width === 'same') return
    stream.columns = columns
    stream.emit('resize')
    await turns()
  }
  const press = async () => {
    input.write(isGrowing ? 'x' : '\u007F')
    await turns()
  }
  if (cell.isRightAfter) await resize()
  await press()
  let length = reached
  if (!cell.isRightAfter) {
    await resize()
    await press()
    length += step
  }
  const rounds: Round[] = []
  for (let round = 0; round < roundCount; round += 1) {
    if (round > 0) {
      await press()
      length += step
    }
    written.length = 0
    if (cell.pause === 'erase') frame.erase()
    else frame.hold()
    const erased = [...written]
    written.length = 0
    frame.flush()
    rounds.push({ erased, flushed: [...written], length })
  }
  input.write('\r')
  await answer
  return rounds
}
const places = [
  'one row shorter than',
  'as tall as',
  'one row taller than',
  'two rows taller than'
]
function cellName({ height, direction, isRightAfter, width, pause }: Cell) {
  const place = `${places[height - tableRows + 1] ?? ''} the screen`
  const stop = isRightAfter ? 'right after the render' : 'after one more key'
  const resized = width === 'same' ? 'at one width' : `with a ${width} screen`
  return `${place}, ${direction}, stopped ${stop}, ${resized}, ${pause === 'erase' ? 'erased' : 'held'}`
}
// The heights go from one row shorter than the screen to two rows taller.
const heightCount = 4
const heights = Array.from(
  { length: heightCount },
  (_, index) => tableRows - 1 + index
)
const cells: Cell[] = []
for (const height of heights) {
  for (const direction of ['growing', 'shrinking'] as const) {
    for (const isRightAfter of [true, false]) {
      for (const width of ['same', 'narrower', 'wider'] as const) {
        const cell = { height, direction, isRightAfter, width }
        cells.push({ ...cell, pause: 'erase' }, { ...cell, pause: 'hold' })
      }
    }
  }
}
type Drawn = { entries: string[]; flushed: string[]; round: string }
// Clack writes again only the rows on screen, so after a question taller than the screen shrinks, or the width changes,
// or a row above the screen changes, the rows above may be old. A draw shows the rows Clack keeps right: the whole
// question when it fits, and as many of its last rows as the screen has when it is taller.
function assertDrawn({ entries, flushed, round }: Drawn): void {
  const [draw = ''] = flushed
  const drawnRows = draw.split('\n').length
  assert.equal(flushed.length, 1, round)
  assert.equal(draw, entries.slice(-drawnRows).join('\n'), `${round}: old row`)
  const expected = Math.min(entries.length, tableRows)
  assert.equal(drawnRows, expected, `${round}: number of rows`)
}
// A question taller than the screen stays on screen while rows of it are above the top that Clack did not write from
// there since its height last grew. A change of width starts again from the rows on screen: narrower, the question grows;
// wider, Clack writes it again from the top. Every other question is erased.
function isErased(cell: Cell): boolean {
  if (cell.pause === 'hold') return false
  if (cell.height <= tableRows) return true
  const isResizedLast = !cell.isRightAfter && cell.width !== 'same'
  const hasGrownLast = isResizedLast
    ? cell.width === 'narrower'
    : cell.direction === 'growing'
  return !hasGrownLast
}
for (const cell of cells) {
  void it(`draws back no old row of a question ${cellName(cell)}`, async () => {
    const rounds = await stopAround(cell)
    for (const [index, { erased, flushed, length }] of rounds.entries()) {
      const round = `round ${index + 1}, ${length} letters`
      const question = await drawnQuestion({
        length,
        columns: columnsAfter[cell.width]
      })
      const entries = question.split('\n')
      assertDrawn({ entries, flushed, round })
      const up = Math.min(entries.length, tableRows) - 1
      assert.deepEqual(
        erased,
        isErased(cell) ? [erasure(up)] : [],
        `${round}: erase`
      )
    }
  })
}

// WHY: Only the error tells a question with an error from one without it.
const notYet = () => 'Not yet'
type Stop = { erased: string[]; flushed: string[] }
// A question on a screen of tableRows rows, with the keys and resizes a test sends and a stop that ends in a flush.
async function openQuestion(columns: number) {
  const stream = Object.assign(new PassThrough(), { columns, rows: tableRows })
  const written: string[] = []
  stream.on('data', chunk => written.push(String(chunk)))
  const frame = questionFrame(stream)
  const input = new PassThrough()
  const { output } = frame
  const answer = text({ message: 'Title', input, output, validate: notYet })
  await turns()
  return {
    async press(key: string) {
      input.write(key)
      await turns()
    },
    async resize(width: number) {
      stream.columns = width
      stream.emit('resize')
      await turns()
    },
    async heighten(height: number) {
      stream.rows = height
      stream.emit('resize')
      await turns()
    },
    async stop(pause: Pause, during?: () => Promise<void>): Promise<Stop> {
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
      input.write('\u0003')
      await answer
    }
  }
}
const twinRows = 1000
// WHY: On a screen that holds the whole question Clack writes again in one write every row from the first that changed.
async function lastWrite(keys: string[]): Promise<string[]> {
  const stream = Object.assign(new PassThrough(), {
    columns: firstColumns,
    rows: twinRows
  })
  const written: string[] = []
  stream.on('data', chunk => written.push(String(chunk)))
  const input = new PassThrough()
  const answer = text({
    message: 'Title',
    input,
    output: stream,
    validate: notYet
  })
  await turns()
  for (const key of keys) {
    input.write(key)
    await turns()
  }
  const lastRows = (written.at(-1) ?? '').split('\n')
  input.write('\u0003')
  await answer
  return lastRows
}
for (const pause of ['erase', 'hold'] as const) {
  const name = 'a validation error'
  void it(`draws back no old row of a question taller than the screen after ${name}, ${pause === 'erase' ? 'erased' : 'held'}`, async () => {
    const [tall = 0] = await valueLengths({
      height: tableRows + rowsAbove,
      columns: firstColumns
    })
    const typed = ['x'.repeat(tall), '\r']
    // Clack changes the symbol of the title, above the screen, and writes the error on the last row, on screen.
    const entries = await lastWrite(typed)
    // Clack wrote again at least the rows on screen, so they are the end of the question as it is now.
    assert.ok(entries.length >= tableRows, JSON.stringify(entries))
    const question = await openQuestion(firstColumns)
    for (const key of typed) await question.press(key)
    const { erased, flushed } = await question.stop(pause)
    await question.close()
    assertDrawn({ entries, flushed, round: name })
    // The question grew past the screen and Clack did not write it from the top since.
    assert.deepEqual(erased, [], `${name}: erase`)
  })
  // A taller screen changes no row of the question, so Clack writes nothing, and the rows above the old screen stay old.
  void it(`draws back no old row of a question taller than the screen after ${name} and a taller screen during the stop, ${pause === 'erase' ? 'erased' : 'held'}`, async () => {
    const [tall = 0] = await valueLengths({
      height: tableRows + rowsAbove,
      columns: firstColumns
    })
    const typed = ['x'.repeat(tall), '\r']
    const entries = await lastWrite(typed)
    assert.ok(entries.length >= tableRows, JSON.stringify(entries))
    const question = await openQuestion(firstColumns)
    for (const key of typed) await question.press(key)
    // The terminal of the stop gets twice as tall.
    const tallScreen = 12
    const { erased, flushed } = await question.stop(pause, async () =>
      question.heighten(tallScreen)
    )
    await question.close()
    // Clack last wrote on the screen of tableRows rows, so the draw has as many rows.
    assertDrawn({ entries, flushed, round: `${name}, taller screen` })
    // The question grew past the screen and Clack did not write it from the top since.
    assert.deepEqual(erased, [], `${name}, taller screen: erase`)
  })
}
const home = '\u001B[H'
const right = '\u001B[C'
const end = '\u001B[F'
// The edit lands on the first row of the value, above the screen.
const editAt = 10
for (const pause of ['erase', 'hold'] as const) {
  const name = 'an edit in the middle of the value'
  void it(`draws back no old row of a question taller than the screen after ${name}, ${pause === 'erase' ? 'erased' : 'held'}`, async () => {
    const [tall = 0] = await valueLengths({
      height: tableRows + rowsAbove,
      columns: firstColumns
    })
    const value = 'x'.repeat(tall)
    const question = await openQuestion(firstColumns)
    // After the letter in the middle the cursor goes back to the end, where one more letter changes the last row alone.
    for (const key of [value, home, right.repeat(editAt), 'y', end, 'z']) {
      await question.press(key)
    }
    const { erased, flushed } = await question.stop(pause)
    await question.close()
    const edited = `${value.slice(0, editAt)}y${value.slice(editAt)}z`
    const drawn = await firstFrame({ value: edited, columns: firstColumns })
    const entries = drawn.split('\n')
    assertDrawn({ entries, flushed, round: name })
    // The letter in the middle makes the question one row taller, so it stays on screen.
    assert.deepEqual(erased, [], `${name}: erase`)
  })
}
// A screen that gets taller during the stop keeps the question taller than it. The next key has Clack write at the new
// height, and the first row of the value, above the old screen, never got the letter of the edit.
const tallerScreen = 8
for (const pause of ['erase', 'hold'] as const) {
  const name =
    'an edit in the middle of the value, a taller screen during the stop and one more key'
  void it(`draws back no old row of a question taller than the screen after ${name}, ${pause === 'erase' ? 'erased' : 'held'}`, async () => {
    const [tall = 0] = await valueLengths({
      height: tableRows + rowsAbove,
      columns: firstColumns
    })
    const value = 'x'.repeat(tall)
    const question = await openQuestion(firstColumns)
    for (const key of [value, home, right.repeat(editAt), 'y', end, 'z']) {
      await question.press(key)
    }
    const first = await question.stop(pause, async () =>
      question.heighten(tallerScreen)
    )
    await question.press('w')
    const second = await question.stop(pause)
    await question.close()
    const edited = `${value.slice(0, editAt)}y${value.slice(editAt)}z`
    const [firstEntries, secondEntries] = await Promise.all(
      [edited, `${edited}w`].map(async typed => {
        const drawn = await firstFrame({ value: typed, columns: firstColumns })
        return drawn.split('\n')
      })
    )
    const firstLength = firstEntries?.length ?? 0
    const secondLength = secondEntries?.length ?? 0
    // The first stop draws the rows of the screen of tableRows rows on which Clack last wrote, and the first of them is the
    // first row Clack keeps right. The letter makes Clack write again, on the taller screen, from the first row that
    // changed among the rows it takes for on screen, so the second stop draws from the higher of those two rows.
    const changed = secondEntries?.findIndex(
      (line, index) => line !== firstEntries?.[index]
    )
    const written = Math.max(changed ?? 0, secondLength - tallerScreen)
    const kept = Math.min(firstLength - tableRows, written)
    const expectedRows = [
      tableRows,
      Math.min(secondLength - kept, tallerScreen)
    ]
    for (const [index, { erased, flushed }] of [first, second].entries()) {
      const entries = (index === 0 ? firstEntries : secondEntries) ?? []
      const [draw = ''] = flushed
      const drawnRows = draw.split('\n').length
      assert.equal(flushed.length, 1, `stop ${index + 1}`)
      assert.equal(
        draw,
        entries.slice(-drawnRows).join('\n'),
        `stop ${index + 1}: old row`
      )
      assert.equal(
        drawnRows,
        expectedRows[index],
        `stop ${index + 1}: number of rows`
      )
      // At the first stop the question grew past the screen. After the letter Clack wrote it again, with an erase below,
      // from the first row it keeps right, so the second stop erases the rows from there.
      const up = (expectedRows[index] ?? 0) - 1
      assert.deepEqual(
        erased,
        index > 0 && pause === 'erase' ? [erasure(up)] : [],
        `stop ${index + 1}: erase`
      )
    }
  })
}
// A screen that gets shorter during the stop changes no row of the question, so Clack writes nothing. The draw has as many
// rows as the shorter screen, and the rows above them stay in the history above what the shell wrote.
const shorterScreen = 4
for (const pause of ['erase', 'hold'] as const) {
  void it(`draws back as many rows as the screen has now of a question taller than the screen after a shorter screen during the stop, ${pause === 'erase' ? 'erased' : 'held'}`, async () => {
    const [tall = 0] = await valueLengths({
      height: tableRows + rowsAbove,
      columns: firstColumns
    })
    const question = await openQuestion(firstColumns)
    await question.press('x'.repeat(tall))
    const { erased, flushed } = await question.stop(pause, async () =>
      question.heighten(shorterScreen)
    )
    await question.close()
    const drawn = await drawnQuestion({ length: tall, columns: firstColumns })
    const entries = drawn.split('\n')
    assert.deepEqual(flushed, [entries.slice(-shorterScreen).join('\n')])
    assert.deepEqual(erased, [], 'erase')
  })
}
// Ctrl+Z, fg and Ctrl+Z again with no key between: the second stop starts from what the flush of the first one left.
for (const height of [tableRows - 1, tableRows + rowsAbove]) {
  for (const pause of ['erase', 'hold'] as const) {
    const place = height < tableRows ? 'shorter than' : 'taller than'
    void it(`draws back no old row of a question ${place} the screen stopped twice with no key between, ${pause === 'erase' ? 'erased' : 'held'}`, async () => {
      const [length = 0] = await valueLengths({
        height,
        columns: firstColumns
      })
      const question = await openQuestion(firstColumns)
      await question.press('x'.repeat(length))
      const first = await question.stop(pause)
      const second = await question.stop(pause)
      await question.close()
      const drawn = await drawnQuestion({ length, columns: firstColumns })
      const entries = drawn.split('\n')
      const up = Math.min(entries.length, tableRows) - 1
      for (const [index, { erased, flushed }] of [first, second].entries()) {
        const round = `stop ${index + 1}`
        assertDrawn({ entries, flushed, round })
        assert.deepEqual(
          erased,
          pause === 'erase' && height < tableRows ? [erasure(up)] : [],
          `${round}: erase`
        )
      }
    })
  }
}
const wideColumns = columnsAfter.wider
const narrowColumns = columnsAfter.narrower
// A narrower screen puts two rows or more above the first row Clack writes of a question taller than the screen, and the
// terminal keeps them at the old width. The question grew, so it stays on screen.
const addedRows = 2
for (const isRightAfter of [true, false]) {
  for (const pause of ['erase', 'hold'] as const) {
    const stop = isRightAfter ? 'right after the render' : 'after one more key'
    void it(`draws back no old row of a question taller than the screen made two rows taller or more by a narrower screen, stopped ${stop}, ${pause === 'erase' ? 'erased' : 'held'}`, async () => {
      const [length = 0] = await valueLengths({
        height: tableRows + 1,
        columns: wideColumns
      })
      const wide = await drawnQuestion({ length, columns: wideColumns })
      const narrow = await drawnQuestion({ length, columns: narrowColumns })
      const added = narrow.split('\n').length - wide.split('\n').length
      assert.ok(added >= addedRows, String(added))
      const question = await openQuestion(wideColumns)
      await question.press('x'.repeat(length))
      await question.resize(narrowColumns)
      if (!isRightAfter) await question.press('x')
      const { erased, flushed } = await question.stop(pause)
      await question.close()
      const drawn = await drawnQuestion({
        length: isRightAfter ? length : length + 1,
        columns: narrowColumns
      })
      assertDrawn({ entries: drawn.split('\n'), flushed, round: stop })
      assert.deepEqual(erased, [], `${stop}: erase`)
    })
  }
}
// Clack renders the question again when the terminal is resized during a stop, while the CLI holds it back, and the flush
// draws the question at the new width. A second stop after one more key checks the rows kept after that flush.
const tallerRows = 2
for (const height of [tableRows, tableRows + tallerRows]) {
  for (const width of ['narrower', 'wider'] as const) {
    for (const pause of ['erase', 'hold'] as const) {
      const place = height === tableRows ? 'as tall as' : 'two rows taller than'
      void it(`draws back no old row of a question ${place} the screen resized to a ${width} screen during the stop, ${pause === 'erase' ? 'erased' : 'held'}`, async () => {
        const [length = 0] = await valueLengths({
          height,
          columns: firstColumns
        })
        const columns = columnsAfter[width]
        const question = await openQuestion(firstColumns)
        await question.press('x'.repeat(length))
        const first = await question.stop(pause, async () =>
          question.resize(columns)
        )
        await question.press('x')
        const second = await question.stop(pause)
        await question.close()
        for (const [index, { erased, flushed }] of [first, second].entries()) {
          const round = `stop ${index + 1}`
          const drawn = await drawnQuestion({ length: length + index, columns })
          const entries = drawn.split('\n')
          assertDrawn({ entries, flushed, round })
          // The first stop comes before the resize; after it, a wider screen has Clack write the question from the top.
          const fits =
            index === 0
              ? height <= tableRows
              : entries.length <= tableRows || width === 'wider'
          const up =
            (index === 0 ? height : Math.min(entries.length, tableRows)) - 1
          assert.deepEqual(
            erased,
            pause === 'erase' && fits ? [erasure(up)] : [],
            `${round}: erase`
          )
        }
      })
    }
  }
}
