import assert from 'node:assert/strict'
import { it } from 'node:test'

import { openTitle, titleFrames } from './question-screen.ts'

// A terminal that gets shorter during a stop, after Ctrl+Z erased a question that fit.
const columns = 30
const rows = 6
const shorterRows = 3
void it('draws back whole a question that Ctrl+Z erased when the terminal got shorter than it during the stop', async () => {
  const keys = ['ab']
  const [entries = ''] = await titleFrames({ columns, keys })
  const question = await openTitle({ columns, rows })
  for (const key of keys) await question.press(key)
  const { erased, flushed } = await question.stop('erase', async () =>
    question.heighten(shorterRows)
  )
  await question.close()
  // The question fits on the screen, so Ctrl+Z erased all of it, and no row of it is in the history.
  const up = entries.split('\n').length - 1
  assert.deepEqual(erased, [`\u001B[${up}A\u001B[2K\u001B[B\r\u001B[J\u001B[A`])
  // Its rows above the shorter screen go to the history as the draw scrolls it.
  assert.deepEqual(flushed, [entries])
})
