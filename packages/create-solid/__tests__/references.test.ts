import assert from 'node:assert/strict'
import { it } from 'node:test'

import { references } from '../tooling/references/index.ts'

void it('collects literal CommonJS module references', () => {
  assert.deepEqual(
    [
      ...references(
        'module.cjs',
        "require('./local'); require(variable); object.require('other'); __require('wrapped'); createRequire(__filename)('factory')"
      )
    ],
    ['./local', 'wrapped', 'factory']
  )
})
