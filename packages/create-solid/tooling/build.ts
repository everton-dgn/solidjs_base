import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  cpSync,
  rmSync,
  chmodSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { fmt } from '@evertondgn/solid-tooling/fmt'
import { literal, object, parse, record, string } from 'valibot'

import { rewriteDocuments, rewritePatchTest } from '../src/rewrite.ts'
import { manifestSchema } from '../src/schema.ts'

const root = path.resolve(import.meta.dirname, '../../..')
const app = path.join(root, 'apps/boilerplate')
const json = (file: string) =>
  parse(manifestSchema, JSON.parse(readFileSync(file, 'utf8')))
const files = execFileSync('git', ['ls-files', '-z'], {
  cwd: app,
  encoding: 'utf8'
})
  .split('\0')
  .filter(Boolean)
const rules = new Map(
  readFileSync('classification.txt', 'utf8')
    .trimEnd()
    .split('\n')
    .map(line => [
      line.slice(line.indexOf(' ') + 1),
      line.slice(0, line.indexOf(' '))
    ])
)
if (files.length !== rules.size || files.some(file => !rules.has(file))) {
  throw new Error('Review classification.txt for changes in apps/boilerplate')
}
const features = parse(
  object({ version: literal(1), files: record(string(), string()) }),
  JSON.parse(readFileSync('features.json', 'utf8'))
)
const templateFiles = files
  .filter(file => rules.get(file) !== 'exclude')
  .map(file => (file === '.gitignore' ? '_gitignore' : file))
assert.deepEqual(
  Object.keys(features.files).sort(),
  templateFiles.sort(),
  'Review features.json for changes in the template'
)
rmSync('template', { recursive: true, force: true })
for (const file of files) {
  const rule = rules.get(file)
  if (rule === 'exclude') continue
  assert.ok(
    rule === 'copy' || rule === 'rewrite',
    `Invalid classification for ${file}`
  )
  const target = path.join(
    'template',
    file === '.gitignore' ? '_gitignore' : file
  )
  mkdirSync(path.dirname(target), { recursive: true })
  cpSync(path.join(app, file), target)
}
rmSync('dist', { recursive: true, force: true })
mkdirSync('dist', { recursive: true })
cpSync('features.json', 'dist/features.json')
const manifest = json(path.join(root, 'package.json'))
const tooling = json(path.join(root, 'packages/solid-tooling/package.json'))
assert.ok(
  manifest.catalog && manifest.overrides && manifest.patchedDependencies
)
assert.ok(tooling.dependencies.lefthook)
const { packageManager } = manifest
assert.ok(packageManager)
assert.ok(packageManager.startsWith('bun@'))
const settings = {
  bunVersion: packageManager.slice('bun@'.length),
  version: json('package.json').version,
  catalog: manifest.catalog,
  overrides: manifest.overrides,
  patches: Object.fromEntries(
    Object.entries(manifest.patchedDependencies).map(([key, file]) => [
      key,
      path.relative(app, path.join(root, file))
    ])
  ),
  versions: Object.fromEntries(
    ['solid-runtime', 'solid-tooling', 'vite-plugin-solid-icons'].map(name => {
      const pkg = json(path.join(root, 'packages', name, 'package.json'))
      return [pkg.name, pkg.version]
    })
  ),
  lefthook: tooling.dependencies.lefthook,
  bunfig: readFileSync(path.join(root, 'bunfig.toml'), 'utf8')
}
writeFileSync('dist/settings.json', JSON.stringify(settings))
execFileSync('bun', [
  'build',
  'src/create-solid.ts',
  '--target=node',
  'src/generate.ts',
  '--outdir=dist',
  '--entry-naming=[name].mjs',
  '--splitting'
])
execFileSync(path.join(root, 'node_modules/.bin/tsc'), [
  '--project',
  'tsconfig.types.json'
])
const formatter = path.join('dist', 'formatter')
mkdirSync(formatter)
writeFileSync(
  path.join(formatter, 'package.json'),
  JSON.stringify({ name: 'template-formatter', private: true })
)
writeFileSync(
  path.join(formatter, 'vite.config.mjs'),
  `export default ${JSON.stringify({ fmt })}\n`
)
const patchTest = 'tooling/__tests__/patched-dependencies.test.ts'
for (const pm of ['bun', 'npm', 'pnpm'] as const) {
  const dir = path.resolve('dist/profiles', pm)
  mkdirSync(path.join(dir, path.dirname(patchTest)), { recursive: true })
  for (const file of ['README.md', patchTest]) {
    cpSync(path.join('template', file), path.join(dir, file))
  }
  rewriteDocuments({ dir, pm, version: settings.version })
  rewritePatchTest({ dir, pm })
}
rewriteDocuments({
  dir: path.resolve('template'),
  pm: 'bun',
  version: settings.version
})
const executableMode = 0o755
chmodSync('dist/create-solid.mjs', executableMode)

// Exercise the conditional patch rewrite too, so stale template inputs fail the build.
const probe = mkdtempSync(path.join(tmpdir(), 'check-solid-template-'))
try {
  execFileSync(process.execPath, [
    'dist/create-solid.mjs',
    probe,
    '--pm',
    'npm',
    '--no-install',
    '--no-git'
  ])
} finally {
  rmSync(probe, { recursive: true, force: true })
}
