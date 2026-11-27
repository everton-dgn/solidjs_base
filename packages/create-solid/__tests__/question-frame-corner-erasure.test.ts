import assert from 'node:assert/strict'
import { it } from 'node:test'

import { openText, track } from './question-screen.ts'

// The erasures of Clack itself from the top left corner of the screen.
const columns = 30
const rows = 6
// Nine rows of value at 30 columns: the question is taller than the screen.
const typedLength = 240
const backspace = '\u007F'
// Two rows of value at 30 columns.
const removedRows = 2
void it('never lets an erasure of Clack start from the top left corner of the screen while a question taller than the screen shrinks', async () => {
  const question = await openText({ columns, rows })
  await question.press('x'.repeat(typedLength))
  question.written.length = 0
  // Each Backspace that removes a row has Clack move up to the top of the screen and erase from there.
  for (let key = 0; key < columns * removedRows; key += 1) {
    await question.press(backspace)
  }
  const bytes = question.written.join('')
  await question.close()
  // The question is taller than the screen, so the cursor starts on the last row of the screen.
  const { cornerErasures } = track({ bytes, row: rows - 1, rows })
  // tmux with scroll-on-clear copies the screen to its history on an erasure that starts from its top left corner.
  assert.equal(cornerErasures, 0)
})
