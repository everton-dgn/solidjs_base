import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { it } from 'node:test'

import { parse } from 'valibot'

import { manifestSchema } from '../src/schema.ts'

void it('leaves the choice of formatter to the installed application', () => {
  const pkg = parse(
    manifestSchema,
    JSON.parse(readFileSync('package.json', 'utf8'))
  )
  assert.equal(pkg.dependencies.oxfmt, undefined)
})
