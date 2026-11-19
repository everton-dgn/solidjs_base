import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
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
import {
  array,
  literal,
  nullable,
  object,
  parse,
  picklist,
  record,
  string,
  union
} from 'valibot'

import { rewriteDocuments, rewritePatchTest } from '../src/rewrite.ts'
import { manifestSchema } from '../src/schema.ts'
import { buildProfiles } from './build-profiles.ts'
import { checkImports } from './check-imports.ts'
import { prepareGuides } from './prepare-guides.ts'
import { prepareTitleTests } from './prepare-title-tests.ts'

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
const feature = picklist([
  'core',
  'fonts',
  'i18n',
  'icons',
  'markdown',
  'outdated-page',
  'publication',
  'server',
  'security-headers',
  'seo',
  'server-errors',
  'sitemap',
  'theme'
])
const inventoryVersion = 2
const fileOwners = union([feature, array(feature)])
const featureSchema = object({
  version: literal(inventoryVersion),
  imports: record(string(), feature),
  serverOnly: array(string()),
  clientExcludes: array(string()),
  files: record(string(), fileOwners)
})
const features = parse(
  featureSchema,
  JSON.parse(readFileSync('features.json', 'utf8'))
)
const templateFiles = files.map(file =>
  file === '.gitignore' ? '_gitignore' : file
)
assert.deepEqual(
  Object.keys(features.files).toSorted(),
  templateFiles.toSorted(),
  'Review features.json for changes in the template'
)
for (const file of [...features.serverOnly, ...features.clientExcludes]) {
  assert.ok(
    Object.hasOwn(features.files, file),
    `Unknown mode-specific file: ${file}`
  )
}
const digestSchema = record(string(), nullable(string()))
const variantSources = parse(
  digestSchema,
  JSON.parse(readFileSync('variant-sources.json', 'utf8'))
)
for (const [file, digest] of Object.entries(variantSources)) {
  const source = path.join(app, file)
  const actual = existsSync(source)
    ? createHash('sha256').update(readFileSync(source)).digest('hex')
    : null
  assert.equal(actual, digest, `Review the generated variant for ${file}`)
}
checkImports({
  dir: app,
  files: templateFiles,
  knownImports: new Set(Object.keys(features.imports))
})
rmSync('template', { recursive: true, force: true })
for (const file of files) {
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
  'src/index.ts',
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
prepareTitleTests()
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
buildProfiles()
prepareGuides()
const executableMode = 0o755
chmodSync('dist/create-solid.mjs', executableMode)

const probe = mkdtempSync(path.join(tmpdir(), 'check-solid-template-'))
try {
  for (const [name, ...flags] of [
    ['server', '--pm', 'npm'],
    [
      'reduced',
      '--no-seo',
      '--no-theme',
      '--no-fonts',
      '--no-icons',
      '--no-diagnostics'
    ],
    ['static', '--mode', 'static'],
    ['client', '--mode', 'client', '--pm', 'pnpm']
  ]) {
    assert.ok(name)
    execFileSync(process.execPath, [
      'dist/create-solid.mjs',
      path.join(probe, name),
      '--no-install',
      '--no-git',
      ...flags
    ])
  }
} finally {
  rmSync(probe, { recursive: true, force: true })
}
