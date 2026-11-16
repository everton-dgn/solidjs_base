import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { describeDuration } from '../wait.ts'

describe('mergePullRequest describeDuration', () => {
  for (const { milliseconds, text } of [
    { milliseconds: 1, text: '1 millisecond(s)' },
    { milliseconds: 499, text: '499 millisecond(s)' },
    { milliseconds: 999, text: '999 millisecond(s)' },
    { milliseconds: 999.6, text: '1 second(s)' },
    { milliseconds: 1000, text: '1 second(s)' },
    { milliseconds: 1499, text: '1 second(s)' },
    { milliseconds: 90_000, text: '90 second(s)' },
    { milliseconds: 60_000, text: '1 minute(s)' },
    { milliseconds: 600_000, text: '10 minute(s)' }
  ]) {
    it(`writes ${milliseconds} ms as ${text}`, () => {
      assert.equal(describeDuration(milliseconds), text)
    })
  }
})
