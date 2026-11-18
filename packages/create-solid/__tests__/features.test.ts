import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { it } from 'node:test'

void it('fails the build when a template file has no feature assignment', context => {
  const dir = mkdtempSync(path.join(tmpdir(), 'solid-features-'))
  context.after(() => rmSync(dir, { recursive: true, force: true }))
  copyFileSync('classification.txt', path.join(dir, 'classification.txt'))
  const input = readFileSync('features.json', 'utf8')
  const incomplete = input.replace('    "README.md": "core",\n', '')
  assert.notEqual(input, incomplete)
  writeFileSync(path.join(dir, 'features.json'), incomplete)
  const result = spawnSync(
    process.execPath,
    [path.resolve('tooling/build.ts')],
    { cwd: dir, encoding: 'utf8' }
  )
  assert.equal(result.status, 1)
  assert.match(
    result.stderr,
    /Review features.json for changes in the template/u
  )
})
