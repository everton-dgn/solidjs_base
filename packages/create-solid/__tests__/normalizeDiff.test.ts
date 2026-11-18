import assert from 'node:assert/strict'
import { it } from 'node:test'

import { normalizeDiff } from '../tooling/normalizeDiff.ts'

it('normalizes newer package pins independently of the generator tag', () => {
  const name = '@evertondgn/solid-runtime'
  const settings = { version: '0.10.0', versions: { [name]: '0.11.0' } }
  assert.equal(
    normalizeDiff('+"' + name + '": "0.11.0" /create-solid@0.10.0/', settings),
    '+"' + name + '": "{version}" /create-solid@{version}/'
  )
})
