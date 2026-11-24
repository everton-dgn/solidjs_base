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
  const erased = `${escape}[4A\r${escape}[J`
  assert.deepEqual(written, [erased])
  input.write('c')
  await turns()
  assert.deepEqual(written, [erased])
  frame.flush()
  const drawn = '│\n◆  Title\n│  abc█\n└\n'
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
    [`${escape}[1A\r${escape}[J`],
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

void it('holds a question whose first row left the top and draws it whole on the flush', () => {
  const { stream, written } = terminal()
  const frame = questionFrame(stream)
  frame.output.write(hide)
  frame.output.write('a\n'.repeat(rows))
  written.length = 0
  frame.erase()
  frame.output.write('more')
  assert.deepEqual(written, [])
  frame.flush()
  assert.deepEqual(written, [`${'a\n'.repeat(rows)}more`])
})

void it('keeps the rows of a question taller than the screen through the renders of Clack', async () => {
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
  assert.deepEqual(written, [lines.join('\n')])
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
    const up = `${escape}[${question.length - 1}A`
    // A question that fills the screen has its first row cleared alone, and the rest from the row below it.
    const erased =
      question.length === tableRows
        ? `${up}${escape}[2K${escape}[B\r${escape}[J${escape}[A`
        : `${up}\r${escape}[J`
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
type Value = { length: number; columns: number }
const drawnQuestions = new Map<string, string>()
// WHY: Clack draws a question that opens with a value whole, so its first frame is the question as Clack has it.
async function drawnQuestion({ length, columns }: Value): Promise<string> {
  const key = `${columns}:${length}`
  const known = drawnQuestions.get(key)
  if (known !== undefined) return known
  const stream = Object.assign(new PassThrough(), { columns, rows: tableRows })
  const written: string[] = []
  stream.on('data', chunk => written.push(String(chunk)))
  const input = new PassThrough()
  const answer = text({
    message: 'Title',
    input,
    output: stream,
    initialValue: 'x'.repeat(length)
  })
  await turns()
  input.write('\r')
  await answer
  const [, frame = ''] = written
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
// Clack writes only the rows on screen again, so after a question taller than the screen shrinks, or the width
// changes, the rows above may be old. A draw shows the end of the question, at least the rows on screen, and the whole
// question when it fits or only grew at one width. What is drawn back is erased first when all of it is on screen.
for (const cell of cells) {
  void it(`draws back no old row of a question ${cellName(cell)}`, async () => {
    const isWholeOnly = cell.direction === 'growing' && cell.width === 'same'
    const rounds = await stopAround(cell)
    for (const [index, { erased, flushed, length }] of rounds.entries()) {
      const round = `round ${index + 1}, ${length} letters`
      const question = await drawnQuestion({
        length,
        columns: columnsAfter[cell.width]
      })
      const entries = question.split('\n')
      const [draw = ''] = flushed
      const drawnRows = draw.split('\n').length
      assert.equal(flushed.length, 1, round)
      assert.equal(draw, entries.slice(-drawnRows).join('\n'), round)
      assert.ok(drawnRows >= Math.min(entries.length, tableRows), round)
      if (entries.length <= tableRows || isWholeOnly) {
        assert.equal(draw, question, round)
      }
      const isErased = cell.pause === 'erase' && drawnRows <= tableRows
      const up = `${escape}[${drawnRows - 1}A`
      const erasure =
        drawnRows === tableRows
          ? `${up}${escape}[2K${escape}[B\r${escape}[J${escape}[A`
          : `${up}\r${escape}[J`
      assert.deepEqual(erased, isErased ? [erasure] : [], round)
    }
  })
}
