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
