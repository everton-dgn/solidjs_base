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

void it('rejects an unknown feature before assembling the template', context => {
  const dir = mkdtempSync(path.join(tmpdir(), 'unknown-feature-'))
  context.after(() => rmSync(dir, { recursive: true, force: true }))
  copyFileSync('classification.txt', path.join(dir, 'classification.txt'))
  const input = readFileSync('features.json', 'utf8')
  writeFileSync(
    path.join(dir, 'features.json'),
    input.replace('"fonts.ts": "fonts"', '"fonts.ts": "unknown-feature"')
  )
  const result = spawnSync(
    process.execPath,
    [path.resolve('tooling/build.ts')],
    { cwd: dir, encoding: 'utf8' }
  )
  assert.equal(result.status, 1)
  assert.match(result.stderr, /unknown-feature/u)
})

void it('rejects missing local imports, re-exports and imported types', async context => {
  const { checkImports } = await import('../tooling/check-imports.ts')
  const dir = mkdtempSync(path.join(tmpdir(), 'unknown-import-'))
  context.after(() => rmSync(dir, { recursive: true, force: true }))
  for (const source of [
    "import '@/missing.ts'",
    "export { value } from './missing.ts'",
    "export * from './missing.ts'",
    "export type T = typeof import('./missing.ts')",
    "export const load = () => import('./missing.ts')"
  ]) {
    writeFileSync(path.join(dir, 'entry.ts'), source)
    assert.throws(
      () => checkImports({ dir, files: ['entry.ts'] }),
      /Unknown template import in entry.ts/u
    )
  }
})
void it('rejects a group of modules reachable only from one another', async context => {
  const { checkImports } = await import('../tooling/check-imports.ts')
  const dir = mkdtempSync(path.join(tmpdir(), 'orphan-modules-'))
  context.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(path.join(dir, 'env.ts'), 'export {}')
  writeFileSync(path.join(dir, 'left.ts'), "import './right.ts'")
  writeFileSync(path.join(dir, 'right.ts'), "import './left.ts'")
  const files = ['env.ts', 'left.ts', 'right.ts']
  assert.throws(
    () => checkImports({ dir, files }),
    /Unreachable template module: left.ts/u
  )
  writeFileSync(path.join(dir, 'env.ts'), "import './left.ts'")
  checkImports({ dir, files })
})

void it('rejects unclassified external imports', async context => {
  const { checkImports } = await import('../tooling/check-imports.ts')
  const dir = mkdtempSync(path.join(tmpdir(), 'external-import-'))
  context.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(path.join(dir, 'env.ts'), "import 'virtual:unknown-module'")
  assert.throws(
    () => checkImports({ dir, files: ['env.ts'], knownImports: new Set() }),
    /Unclassified import in env.ts: virtual:unknown-module/u
  )
})

void it('rejects an unreviewed source digest before assembling whole-file variants', context => {
  const dir = mkdtempSync(path.join(tmpdir(), 'solid-variant-drift-'))
  context.after(() => rmSync(dir, { recursive: true, force: true }))
  for (const file of ['classification.txt', 'features.json']) {
    copyFileSync(file, path.join(dir, file))
  }
  writeFileSync(
    path.join(dir, 'variant-sources.json'),
    JSON.stringify({ 'src/entry-client.tsx': 'unreviewed' })
  )
  const result = spawnSync(
    process.execPath,
    [path.resolve('tooling/build.ts')],
    { cwd: dir, encoding: 'utf8' }
  )
  assert.equal(result.status, 1)
  assert.match(
    result.stderr,
    /Review the generated variant for src\/entry-client.tsx/u
  )
})
