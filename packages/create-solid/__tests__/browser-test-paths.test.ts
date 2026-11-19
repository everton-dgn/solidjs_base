import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { it } from 'node:test'

import { generate } from '../src/generate.ts'

void it('ships the reference tests for custom locales', t => {
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
  const isTestFile = (file: string) =>
    file.startsWith('src/tests/') || file.includes('/__tests__/')
  const referenceTests = execFileSync('git', ['ls-files', '-z'], {
    cwd: reference,
    encoding: 'utf8'
  })
    .split('\0')
    .filter(isTestFile)
  const generatedTests = readdirSync(dir, {
    recursive: true,
    withFileTypes: true
  })
    .filter(entry => entry.isFile())
    .map(entry => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .filter(isTestFile)
  assert.deepEqual(
    generatedTests.toSorted(),
    [
      ...referenceTests,
      'src/tests/pages/Home/Home.profile.production.e2e.test.ts'
    ].toSorted()
  )
  const differences = generatedTests.filter(file => {
    const original = path.join(reference, file)
    return (
      !existsSync(original) ||
      !readFileSync(path.join(dir, file)).equals(readFileSync(original))
    )
  })
  assert.deepEqual(differences.toSorted(), [
    'src/components/molecules/SiteContent/__tests__/SiteContent.dom.test.tsx',
    'src/components/organisms/ErrorFallback/__tests__/ErrorFallback.dom.test.tsx',
    'src/tests/pages/Home/Home.profile.production.e2e.test.ts',
    'src/tests/pages/Home/Home.seo.e2e.test.ts',
    'src/tests/pages/I18n/I18n.seo.production.e2e.test.ts',
    'tooling/__tests__/patched-dependencies.test.ts'
  ])
})
