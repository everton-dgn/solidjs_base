import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { it } from 'node:test'

import { multiselect, text } from '@clack/prompts'

import { questionFrame } from '../src/questionFrame/index.ts'
import {
  openPlainText,
  openText,
  openTitle,
  textFrames,
  turns,
  type Pause
} from './question-screen.ts'

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

// A text question with no limit of rows, registered with the question frame as the CLI registers its text questions, is
// the question the tests stop past the height of the screen. The question frame computes it from the state of the prompt,
// so it draws no old row, and it erases the rows of it that are on the screen.
const firstColumns = 30
const longest = 260
type Value = { length: number; columns: number }
const typedFrames = new Map<number, Promise<string[]>>()
// The question after each letter of a value of x typed one by one, as Clack has it.
async function drawnQuestion({ length, columns }: Value): Promise<string> {
  let frames = typedFrames.get(columns)
  if (!frames) {
    frames = textFrames({
      columns,
      keys: Array.from({ length: longest }, () => 'x')
    })
    typedFrames.set(columns, frames)
  }
  const typed = await frames
  return typed[length - 1] ?? ''
}
type Height = { height: number; columns: number }
async function valueLengths({ height, columns }: Height): Promise<number[]> {
  const found: number[] = []
  for (let length = 1; length <= longest; length += 1) {
    const frame = await drawnQuestion({ length, columns })
    if (frame.split('\n').length === height) found.push(length)
  }
  return found
}
type Typing = { columns: number; keys: string[] }
async function lastFrame(keys: Typing): Promise<string[]> {
  const frames = await textFrames(keys)
  return (frames.at(-1) ?? '').split('\n')
}
const backspace = '\u007F'
// Nine rows of value at 30 columns.
const tallLength = 240
type Drawn = {
  entries: string[]
  flushed: string[]
  round: string
  drawnRows?: number
}
// A draw shows the last rows of the question as it is now: as many as the erase took from the screen, and at least as many
// as the screen has now, so that Clack finds there the rows it counts on screen. A held question keeps every row of it on
// the screen or in the history, so its draw has as many rows as fit on the screen.
function assertDrawn({
  entries,
  flushed,
  round,
  drawnRows = Math.min(entries.length, tableRows)
}: Drawn): void {
  const [flush = ''] = flushed
  // The draw starts from the first column of the row of the cursor.
  assert.ok(flush.startsWith('\r'), `${round}: first column`)
  const draw = flush.slice(1)
  const rowCount = draw.split('\n').length
  assert.equal(flushed.length, 1, round)
  assert.equal(draw, entries.slice(-rowCount).join('\n'), `${round}: old row`)
  assert.equal(rowCount, drawnRows, `${round}: number of rows`)
}
function erasedRows({ pause, up }: { pause: Pause; up: number }): string[] {
  return pause === 'erase' ? [erasure(up)] : []
}
const pauseName = (pause: Pause) => (pause === 'erase' ? 'erased' : 'held')

const home = '\u001B[H'
const right = '\u001B[C'
// oxlint-disable-next-line no-control-regex
const moveOnly = /^\u001B\[999D\u001B\[\d+A$/u
for (const pause of ['erase', 'hold'] as const) {
  // When every row that changed is above the screen Clack moves the cursor up to the top of the screen and writes nothing
  // more: an arrow to the right after Home moves the cursor inside the first row of the value.
  void it(`erases the rows on screen of a question taller than the screen after Clack wrote only its move up, ${pauseName(pause)}`, async () => {
    const keys = ['x'.repeat(tallLength), home, right]
    const entries = await lastFrame({ columns: firstColumns, keys })
    assert.ok(entries.length > tableRows, String(entries.length))
    const screen = { columns: firstColumns, rows: tableRows }
    const plain = await openPlainText(screen)
    const question = await openText(screen)
    for (const key of keys) {
      plain.written.length = 0
      await plain.press(key)
      await question.press(key)
    }
    assert.match(plain.written.join(''), moveOnly)
    await plain.close()
    const { erased, flushed } = await question.stop(pause)
    await question.close()
    assertDrawn({ entries, flushed, round: 'move up' })
    assert.deepEqual(erased, erasedRows({ pause, up: tableRows - 1 }))
  })
}

void it('draws back the rows on screen of a question taller than the screen after a key read during the stop', async () => {
  const value = 'x'.repeat(tallLength)
  const entries = await lastFrame({
    columns: firstColumns,
    keys: [value, 'y']
  })
  assert.ok(entries.length > tableRows, String(entries.length))
  const question = await openText({ columns: firstColumns, rows: tableRows })
  await question.press(value)
  const { erased, flushed } = await question.stop('erase', async () =>
    question.press('y')
  )
  await question.close()
  assertDrawn({ entries, flushed, round: 'key during the stop' })
  assert.deepEqual(erased, [erasure(tableRows - 1)])
})

void it('counts the 20 rows and 80 columns of Clack on a stream that has no size', async () => {
  const clackRows = 20
  const clackColumns = 80
  // Eighteen rows of value at 80 columns: the question is taller than 20 rows.
  const valueLength = 1309
  const value = 'x'.repeat(valueLength)
  const entries = await lastFrame({ columns: clackColumns, keys: [value] })
  assert.ok(entries.length > clackRows, String(entries.length))
  const question = await openText({})
  await question.press(value)
  const { erased, flushed } = await question.stop('erase')
  await question.close()
  assert.deepEqual(erased, [erasure(clackRows - 1)])
  assert.deepEqual(flushed, [`\r${entries.slice(-clackRows).join('\n')}`])
})

void it('draws the rows on screen of a question taller than the screen after the renders of Clack', async () => {
  const columns = 20
  const typedLength = 60
  const keys = ['x'.repeat(typedLength), 'y']
  const entries = await lastFrame({ columns, keys })
  assert.ok(entries.length > tableRows, String(entries.length))
  const question = await openText({ columns, rows: tableRows })
  for (const key of keys) await question.press(key)
  const { flushed } = await question.stop('erase')
  await question.close()
  assertDrawn({ entries, flushed, round: 'renders' })
})

void it('erases a question that was taller than the screen once its value is erased until it fits', async () => {
  const columns = 20
  const typedLength = 60
  const keptLength = 30
  const eraseLine = '\u0015'
  for (const keys of [
    [backspace.repeat(typedLength - keptLength)],
    [eraseLine]
  ]) {
    const typed = ['x'.repeat(typedLength), ...keys]
    const entries = await lastFrame({ columns, keys: typed })
    assert.ok(entries.length <= tableRows, JSON.stringify(entries))
    const question = await openText({ columns, rows: tableRows })
    for (const key of typed) await question.press(key)
    const { erased, flushed } = await question.stop('erase')
    await question.close()
    // The question starts on the top row of the screen whether it fills it or not.
    assert.deepEqual(
      erased,
      [erasure(entries.length - 1)],
      JSON.stringify(keys)
    )
    assert.deepEqual(flushed, [`\r${entries.join('\n')}`], JSON.stringify(keys))
  }
})

void it('draws a held title question before the bytes that close it', async () => {
  const question = await openTitle({ columns: 80, rows })
  await question.press('ab')
  question.frame.erase()
  question.written.length = 0
  await question.press('\r')
  const closed = ['\r│\n◇  Application title\n│  ab\n', show]
  assert.deepEqual(question.written.slice(0, closed.length), closed)
  await question.close()
})

// A question shorter than the screen keeps one row of value, so growing reaches it with a second letter.
const shortLength = 2
// A question that shrinks starts this many rows taller than the screen.
const rowsAbove = 3
const roundCount = 2
const columnsAfter = { same: 30, narrower: 20, wider: 40 } as const
type Direction = 'growing' | 'shrinking'
type Cell = {
  height: number
  direction: Direction
  isRightAfter: boolean
  width: keyof typeof columnsAfter
  pause: Pause
}
type Round = { erased: string[]; flushed: string[]; length: number }
async function stopAround(cell: Cell): Promise<Round[]> {
  const columns = columnsAfter[cell.width]
  const question = await openText({ columns: firstColumns, rows: tableRows })
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
  await question.press('x'.repeat(typed))
  await question.press(backspace.repeat(typed - before))
  const resize = async () => {
    if (cell.width !== 'same') await question.resize(columns)
  }
  const press = async () => question.press(isGrowing ? 'x' : backspace)
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
    rounds.push({ ...(await question.stop(cell.pause)), length })
  }
  await question.close()
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
  return `${place}, ${direction}, stopped ${stop}, ${resized}, ${pauseName(pause)}`
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
        erasedRows({ pause: cell.pause, up }),
        `${round}: erase`
      )
    }
  })
}

for (const pause of ['erase', 'hold'] as const) {
  const name = 'a validation error'
  // A title of spaces only is an error, which changes the symbol of the title, above the screen.
  const errorKeys = async () => {
    const [tall = 0] = await valueLengths({
      height: tableRows + rowsAbove,
      columns: firstColumns
    })
    return [' '.repeat(tall), '\r']
  }
  void it(`draws back no old row of a question taller than the screen after ${name}, ${pauseName(pause)}`, async () => {
    const keys = await errorKeys()
    const entries = await lastFrame({ columns: firstColumns, keys })
    assert.ok(entries.length > tableRows, JSON.stringify(entries))
    const question = await openText({
      columns: firstColumns,
      rows: tableRows
    })
    for (const key of keys) await question.press(key)
    const { erased, flushed } = await question.stop(pause)
    await question.close()
    assertDrawn({ entries, flushed, round: name })
    assert.deepEqual(
      erased,
      erasedRows({ pause, up: tableRows - 1 }),
      `${name}: erase`
    )
  })
  // A taller screen changes no row of the question, so Clack writes nothing, and it counts on the taller screen every row
  // that fits there.
  void it(`draws back no old row of a question taller than the screen after ${name} and a taller screen during the stop, ${pauseName(pause)}`, async () => {
    const keys = await errorKeys()
    const entries = await lastFrame({ columns: firstColumns, keys })
    assert.ok(entries.length > tableRows, JSON.stringify(entries))
    const question = await openText({
      columns: firstColumns,
      rows: tableRows
    })
    for (const key of keys) await question.press(key)
    // The terminal of the stop gets twice as tall.
    const tallScreen = 12
    const { erased, flushed } = await question.stop(pause, async () =>
      question.heighten(tallScreen)
    )
    await question.close()
    assertDrawn({
      entries,
      flushed,
      round: `${name}, taller screen`,
      drawnRows: Math.min(entries.length, tallScreen)
    })
    assert.deepEqual(
      erased,
      erasedRows({ pause, up: tableRows - 1 }),
      `${name}, taller screen: erase`
    )
  })
}
const end = '\u001B[F'
// The edit lands on the first row of the value, above the screen.
const editAt = 10
async function editedValue(): Promise<string> {
  const [tall = 0] = await valueLengths({
    height: tableRows + rowsAbove,
    columns: firstColumns
  })
  return 'x'.repeat(tall)
}
// After the letter in the middle the cursor goes back to the end, where one more letter changes the last row alone.
const editKeys = (value: string) => [
  value,
  home,
  right.repeat(editAt),
  'y',
  end,
  'z'
]
const edit = (value: string) =>
  `${value.slice(0, editAt)}y${value.slice(editAt)}z`
for (const pause of ['erase', 'hold'] as const) {
  const name = 'an edit in the middle of the value'
  void it(`draws back no old row of a question taller than the screen after ${name}, ${pauseName(pause)}`, async () => {
    const value = await editedValue()
    const question = await openText({
      columns: firstColumns,
      rows: tableRows
    })
    for (const key of editKeys(value)) await question.press(key)
    const { erased, flushed } = await question.stop(pause)
    await question.close()
    const entries = await lastFrame({
      columns: firstColumns,
      keys: [edit(value)]
    })
    assertDrawn({ entries, flushed, round: name })
    assert.deepEqual(
      erased,
      erasedRows({ pause, up: tableRows - 1 }),
      `${name}: erase`
    )
  })
}
// A screen that gets taller during the stop keeps the question taller than it. The first row of the value, above the old
// screen, got the letter of the edit.
const tallerScreen = 8
for (const pause of ['erase', 'hold'] as const) {
  const name =
    'an edit in the middle of the value, a taller screen during the stop and one more key'
  void it(`draws back no old row of a question taller than the screen after ${name}, ${pauseName(pause)}`, async () => {
    const value = await editedValue()
    const question = await openText({
      columns: firstColumns,
      rows: tableRows
    })
    for (const key of editKeys(value)) await question.press(key)
    const first = await question.stop(pause, async () =>
      question.heighten(tallerScreen)
    )
    await question.press('w')
    const second = await question.stop(pause)
    await question.close()
    const edited = edit(value)
    const [firstEntries = [], secondEntries = []] = await Promise.all(
      [edited, `${edited}w`].map(async typed =>
        lastFrame({ columns: firstColumns, keys: [typed] })
      )
    )
    // The first erase takes the rows of the screen of tableRows rows, the second those of the taller screen.
    const screens = [tableRows, tallerScreen]
    for (const [index, { erased, flushed }] of [first, second].entries()) {
      const round = `stop ${index + 1}`
      const entries = index === 0 ? firstEntries : secondEntries
      assertDrawn({
        entries,
        flushed,
        round,
        drawnRows: Math.min(entries.length, tallerScreen)
      })
      const up = Math.min(entries.length, screens[index] ?? 0) - 1
      assert.deepEqual(erased, erasedRows({ pause, up }), `${round}: erase`)
    }
  })
}
// A screen that gets shorter during the stop changes no row of the question, so Clack writes nothing. The draw has the rows
// the erase took from the screen, and the rows above the shorter screen go to the history.
const shorterScreen = 4
for (const pause of ['erase', 'hold'] as const) {
  void it(`draws back the rows it erased of a question taller than the screen after a shorter screen during the stop, ${pauseName(pause)}`, async () => {
    const [tall = 0] = await valueLengths({
      height: tableRows + rowsAbove,
      columns: firstColumns
    })
    const question = await openText({
      columns: firstColumns,
      rows: tableRows
    })
    await question.press('x'.repeat(tall))
    const { erased, flushed } = await question.stop(pause, async () =>
      question.heighten(shorterScreen)
    )
    await question.close()
    const drawn = await drawnQuestion({ length: tall, columns: firstColumns })
    const entries = drawn.split('\n')
    const drawnRows = pause === 'erase' ? tableRows : shorterScreen
    assert.deepEqual(flushed, [`\r${entries.slice(-drawnRows).join('\n')}`])
    assert.deepEqual(erased, erasedRows({ pause, up: tableRows - 1 }), 'erase')
  })
}
// Ctrl+Z, fg and Ctrl+Z again with no key between: the second stop starts from what the flush of the first one left.
for (const height of [tableRows - 1, tableRows + rowsAbove]) {
  for (const pause of ['erase', 'hold'] as const) {
    const place = height < tableRows ? 'shorter than' : 'taller than'
    void it(`draws back no old row of a question ${place} the screen stopped twice with no key between, ${pauseName(pause)}`, async () => {
      const [length = 0] = await valueLengths({
        height,
        columns: firstColumns
      })
      const question = await openText({
        columns: firstColumns,
        rows: tableRows
      })
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
        assert.deepEqual(erased, erasedRows({ pause, up }), `${round}: erase`)
      }
    })
  }
}
const wideColumns = columnsAfter.wider
const narrowColumns = columnsAfter.narrower
// A narrower screen puts two rows or more above the first row Clack writes of a question taller than the screen, and the
// terminal keeps them at the old width.
const addedRows = 2
for (const isRightAfter of [true, false]) {
  for (const pause of ['erase', 'hold'] as const) {
    const stop = isRightAfter ? 'right after the render' : 'after one more key'
    void it(`draws back no old row of a question taller than the screen made two rows taller or more by a narrower screen, stopped ${stop}, ${pauseName(pause)}`, async () => {
      const [length = 0] = await valueLengths({
        height: tableRows + 1,
        columns: wideColumns
      })
      const wide = await drawnQuestion({ length, columns: wideColumns })
      const narrow = await drawnQuestion({ length, columns: narrowColumns })
      const added = narrow.split('\n').length - wide.split('\n').length
      assert.ok(added >= addedRows, String(added))
      const question = await openText({
        columns: wideColumns,
        rows: tableRows
      })
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
      assert.deepEqual(
        erased,
        erasedRows({ pause, up: tableRows - 1 }),
        `${stop}: erase`
      )
    })
  }
}
// Clack renders the question again when the terminal is resized during a stop, while the CLI holds it back, and the flush
// draws the question at the new width. After an erase the rows above the screen are at the old width, so the flush draws
// the whole question; a held one stays whole on the screen or in the history. A second stop after one more key checks
// the question after that flush.
const tallerRows = 2
for (const height of [tableRows, tableRows + tallerRows]) {
  for (const width of ['narrower', 'wider'] as const) {
    for (const pause of ['erase', 'hold'] as const) {
      const place = height === tableRows ? 'as tall as' : 'two rows taller than'
      void it(`draws back no old row of a question ${place} the screen resized to a ${width} screen during the stop, ${pauseName(pause)}`, async () => {
        const [length = 0] = await valueLengths({
          height,
          columns: firstColumns
        })
        const columns = columnsAfter[width]
        const question = await openText({
          columns: firstColumns,
          rows: tableRows
        })
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
          const isWhole = index === 0 && pause === 'erase'
          assertDrawn({
            entries,
            flushed,
            round,
            drawnRows: isWhole
              ? entries.length
              : Math.min(entries.length, tableRows)
          })
          // The first stop comes before the resize, so it erases the rows on screen at the first width.
          const up =
            Math.min(index === 0 ? height : entries.length, tableRows) - 1
          assert.deepEqual(erased, erasedRows({ pause, up }), `${round}: erase`)
        }
      })
    }
  }
}
