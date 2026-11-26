import assert from 'node:assert/strict'
import { it } from 'node:test'

import {
  erasure,
  openTitle,
  pauseName,
  titleFrames
} from './question-screen.ts'

// In raw mode Ctrl+\ and Ctrl+] reach readline as characters with no name, which it puts in the value of a text question.
const ctrlBackslash = '\u001C'
const ctrlBracket = '\u001D'
// Clack erases a Tab with Ctrl+H right after readline puts it in the value, and Ctrl+_ has readline undo that erase, so the Tab stays.
const tab = '\t'
const undo = '\u001F'
const columns = 30
const rows = 6
const values = [
  { name: 'no control character', keys: ['ab', 'c'] },
  { name: 'the character of Ctrl+\\', keys: ['ab', ctrlBackslash, 'c'] },
  { name: 'the character of Ctrl+]', keys: ['ab', ctrlBracket, 'c'] },
  { name: 'a Tab', keys: ['ab', tab, 'c'] },
  { name: 'a Tab and Ctrl+_', keys: ['ab', tab, undo, 'c'] }
]
for (const { name, keys } of values) {
  for (const pause of ['erase', 'hold'] as const) {
    void it(`erases and draws back a title question whose value holds ${name}, ${pauseName(pause)}`, async () => {
      const frames = await titleFrames({ columns, keys })
      const entries = frames.at(-1) ?? ''
      const question = await openTitle({ columns, rows })
      for (const key of keys) await question.press(key)
      const { erased, flushed } = await question.stop(pause)
      await question.close()
      // The question fits on the screen, so Ctrl+Z erases all of it and fg draws it whole; a held one stays whole.
      const up = entries.split('\n').length - 1
      assert.deepEqual(
        { erased, flushed },
        {
          erased: pause === 'erase' ? [erasure(up)] : [],
          flushed: [`\r${entries}`]
        }
      )
    })
  }
}
