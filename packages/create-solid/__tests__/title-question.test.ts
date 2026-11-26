import assert from 'node:assert/strict'
import { it } from 'node:test'
import { stripVTControlCharacters } from 'node:util'

import { titleFrames } from './question-screen.ts'

void it('shows the message of a validation error only while the title question is in error, as Clack does', async () => {
  const frames = await titleFrames({ columns: 80, keys: ['  ', '\r', 'y'] })
  const [, failed = '', next = ''] = frames.map(frame =>
    stripVTControlCharacters(frame)
  )
  assert.match(failed, /▲ {2}Application title/u)
  assert.match(failed, /└ {2}Enter a title/u)
  assert.match(next, /◆ {2}Application title/u)
  assert.doesNotMatch(next, /Enter a title/u)
})
