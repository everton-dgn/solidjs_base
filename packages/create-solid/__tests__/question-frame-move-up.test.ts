import assert from 'node:assert/strict'
import { it } from 'node:test'

import { openTitle, track } from './question-screen.ts'

// A stop after a render that only moved the cursor up.
const columns = 30
const rows = 6
// Four rows of spaces at 30 columns, which the title question takes for an error: the question has 9 rows.
const spaceCount = 100
const spaces = ' '.repeat(spaceCount)
const up = '\u001B[A'
void it('brings the cursor back to the end of a question when Clack only moved it up to the top of the screen, before an outside stop holds the question', async () => {
  const question = await openTitle({ columns, rows })
  await question.press(spaces)
  // The question is taller than the screen, so its last row, where Clack leaves the cursor, is the last row of the screen.
  await question.press('\r')
  question.written.length = 0
  // The arrow ends the error, which changes only the symbol of the title, above the screen, so Clack writes only its move up.
  await question.press(up)
  const moved = question.written.join('')
  const cursor = track({ bytes: moved, row: rows - 1, rows })
  question.written.length = 0
  // An outside stop while the CLI does not own the terminal: the question is held, and the shell writes where the cursor is.
  question.frame.hold()
  const held = [...question.written]
  await question.close()
  process.stdout.write(`${JSON.stringify({ moved, cursor, held })}\n`)
  assert.deepEqual(
    { row: cursor.row, column: cursor.column },
    { row: rows - 1, column: 0 },
    JSON.stringify(moved)
  )
  // Without the terminal the CLI writes nothing on the stop itself.
  assert.deepEqual(held, [])
})
