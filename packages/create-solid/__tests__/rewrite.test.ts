import assert from 'node:assert/strict'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { it, type TestContext } from 'node:test'

import {
  rewriteDocuments,
  rewriteKnip,
  rewritePatchTest,
  rewriteVite
} from '../src/rewrite.ts'

function folder(context: TestContext) {
  const dir = mkdtempSync(path.join(tmpdir(), 'solid-rewrite-'))
  context.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

void it('rewrites external links in copied Markdown and preserves local links', context => {
  const dir = folder(context)
  const file = path.join(dir, 'guide.md')
  writeFileSync(file, '[Upstream](../../README.md) and [local](guide.md).\n')
  rewriteDocuments({ dir, pm: 'bun', version: '1.2.3' })
  const output = readFileSync(file, 'utf8')
  assert.match(output, /blob\/create-solid@1\.2\.3\/README\.md/u)
  assert.ok(output.includes('[local](guide.md)'))
})

void it('rejects a missing Knip workspace block', context => {
  const dir = folder(context)
  mkdirSync(path.join(dir, 'tooling'))
  writeFileSync(path.join(dir, 'tooling/knip.ts'), 'export default {}')
  assert.throws(() => rewriteKnip(dir), /Missing Knip workspace inputs/u)
})

void it('makes the patch test read the standalone root', context => {
  const dir = folder(context)
  const file = 'tooling/__tests__/patched-dependencies.test.ts'
  mkdirSync(path.join(dir, path.dirname(file)), { recursive: true })
  cpSync(path.join('template', file), path.join(dir, file))
  rewritePatchTest({ dir, pm: 'bun', patches: {} })
  assert.ok(
    readFileSync(path.join(dir, file), 'utf8').includes(
      "path.resolve(import.meta.dirname, '../..')"
    )
  )
})

void it('refuses a Vite config missing the expected workspace block', context => {
  const dir = folder(context)
  writeFileSync(path.join(dir, 'vite.config.ts'), 'export default {}')
  assert.throws(() => rewriteVite(dir), /Missing Vite workspace inputs/u)
})
