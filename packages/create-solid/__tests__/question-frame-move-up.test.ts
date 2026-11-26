import assert from 'node:assert/strict'
import { it } from 'node:test'

import { openPlainText, openText, track } from './question-screen.ts'

// A stop after a render that only moved the cursor up.
const columns = 30
const rows = 6
// Nine rows of value at 30 columns: the question is taller than the screen.
const typedLength = 240
const home = '\u001B[H'
const right = '\u001B[C'
// oxlint-disable-next-line no-control-regex
const moveOnly = /^\u001B\[999D\u001B\[\d+A$/u
void it('brings the cursor back to the end of a question when Clack only moved it up to the top of the screen, before an outside stop holds the question', async () => {
  const screen = { columns, rows }
  const plain = await openPlainText(screen)
  const question = await openText(screen)
  for (const key of ['x'.repeat(typedLength), home]) {
    await plain.press(key)
    await question.press(key)
  }
  plain.written.length = 0
  question.written.length = 0
  // The arrow moves the cursor inside the first row of the value, above the screen, so Clack writes only its move up.
  await plain.press(right)
  await question.press(right)
  assert.match(plain.written.join(''), moveOnly)
  await plain.close()
  const moved = question.written.join('')
  // The question is taller than the screen, so its last row, where Clack leaves the cursor, is the last row of the screen.
  const cursor = track({ bytes: moved, row: rows - 1, rows })
  question.written.length = 0
  // An outside stop while the CLI does not own the terminal: the question is held, and the shell writes where the cursor is.
  const drawn = question.draws()
  question.frame.hold()
  const held = [...question.written]
  assert.ok(
    question.draws() > drawn,
    'the stop computed no frame from the prompt'
  )
  await question.close()
  assert.deepEqual(
    { row: cursor.row, column: cursor.column },
    { row: rows - 1, column: 0 },
    JSON.stringify(moved)
  )
  // Without the terminal the CLI writes nothing on the stop itself.
  assert.deepEqual(held, [])
})
