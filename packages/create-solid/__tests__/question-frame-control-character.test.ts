import assert from 'node:assert/strict'
import { it } from 'node:test'

import { openTitle, titleFrames, type Pause } from './question-screen.ts'

// In raw mode Ctrl+\ reaches readline as a character with no name, which it puts in the value of a text question.
const ctrlBackslash = '\u001C'
const columns = 30
const rows = 6
const values = [
  { name: 'no control character', keys: ['ab', 'c'] },
  { name: 'the character of Ctrl+\\', keys: ['ab', ctrlBackslash, 'c'] }
]
function erasure(up: number): string {
  return `\u001B[${up}A\u001B[2K\u001B[B\r\u001B[J\u001B[A`
}
const pauseName = (pause: Pause) => (pause === 'erase' ? 'erased' : 'held')
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
        { erased: pause === 'erase' ? [erasure(up)] : [], flushed: [entries] }
      )
    })
  }
}
