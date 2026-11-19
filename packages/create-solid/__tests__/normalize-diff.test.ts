import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { it } from 'node:test'

import {
  normalizeDiff,
  normalizePackedDiff
} from '../tooling/normalize-diff.ts'

void it('normalizes newer package pins independently of the generator tag', () => {
  const name = '@evertondgn/solid-runtime'
  const settings = { version: '0.10.0', versions: { [name]: '0.11.0' } }
  assert.equal(
    normalizeDiff(`+"${name}": "0.11.0" /create-solid@0.10.0/`, settings),
    `+"${name}": "{version}" /create-solid@{version}/`
  )
})

void it('reads dependency versions from the extracted package settings', context => {
  const directory = mkdtempSync(path.join(tmpdir(), 'solid-packed-versions-'))
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  mkdirSync(path.join(directory, 'dist'))
  const name = '@evertondgn/solid-runtime'
  const source = readFileSync('dist/settings.json', 'utf8')
  const settings: unknown = JSON.parse(source)
  assert.ok(settings !== null && typeof settings === 'object')
  writeFileSync(
    path.join(directory, 'dist/settings.json'),
    JSON.stringify({ ...settings, versions: { [name]: '99.1.0' } })
  )
  assert.equal(
    normalizePackedDiff({ directory, diff: `+"${name}": "99.1.0"` }),
    `+"${name}": "{version}"`
  )
})
