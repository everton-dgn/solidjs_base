import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { it } from 'node:test'

import { generate } from '../src/generate.ts'

void it('ships the reference navigation and browser history tests for custom locales', t => {
  const sandbox = mkdtempSync(path.join(tmpdir(), 'reference-browser-tests-'))
  t.after(() => rmSync(sandbox, { recursive: true, force: true }))
  const dir = path.join(sandbox, 'app')
  generate({
    dir,
    pm: 'bun',
    mode: 'server',
    locales: ['fr', 'ja'],
    baseLocale: 'ja',
    shouldInitGit: false,
    shouldInstall: false
  })
  const reference = path.resolve(
    import.meta.dirname,
    '../../../apps/boilerplate'
  )
  for (const file of [
    'src/middleware/__tests__/middleware.node.test.ts',
    'src/tests/setup/browser/__tests__/browser.browser.test.ts',
    'src/tests/pages/I18n/I18n.hydration.e2e.test.ts',
    'src/tests/pages/I18n/I18n.urlPattern.production.e2e.test.ts',
    'src/tests/pages/Home/Home.theme.e2e.test.ts'
  ]) {
    assert.equal(
      readFileSync(path.join(dir, file), 'utf8'),
      readFileSync(path.join(reference, file), 'utf8'),
      file
    )
  }
})
