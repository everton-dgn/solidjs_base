import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { it } from 'node:test'

import { prepareGuides } from '../tooling/prepare-guides.ts'

void it('matches every byte of both serial prepared artifacts', context => {
  const output = mkdtempSync(path.join(tmpdir(), 'serial-prepared-'))
  context.after(() => rmSync(output, { recursive: true, force: true }))
  prepareGuides({ isSerial: true, output })
  for (const name of ['prepared-guides.json', 'prepared-source.json']) {
    assert.ok(
      readFileSync(path.join(output, name)).equals(
        readFileSync(path.join('dist', name))
      ),
      name
    )
  }
})
