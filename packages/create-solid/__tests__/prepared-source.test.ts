import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { it } from 'node:test'

import { applyPreparedSource } from '../src/prepared-source.ts'

void it('rejects an unregistered localized file even when it needs no formatting', context => {
  const stage = mkdtempSync(path.join(tmpdir(), 'prepared-source-'))
  context.after(() => rmSync(stage, { recursive: true, force: true }))
  const file = path.join(stage, 'unknown.ts')
  writeFileSync(file, 'export const unknown = true\n')
  assert.throws(
    () => applyPreparedSource({ stage, files: [file] }),
    /Missing prepared source for unknown\.ts/u
  )
})
