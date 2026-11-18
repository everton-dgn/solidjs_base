import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  cpSync,
  rmSync,
  chmodSync
} from 'node:fs'
import path from 'node:path'

import { parse } from 'valibot'

import { rewriteDocuments, rewritePatchTest } from './src/rewrite.ts'
import { manifestSchema } from './src/types.ts'

const root = path.resolve(import.meta.dirname, '../..')
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
const manifest = json(path.join(root, 'package.json'))
const tooling = json(path.join(root, 'packages/solid-tooling/package.json'))
assert.ok(
  manifest.catalog && manifest.overrides && manifest.patchedDependencies
)
assert.ok(tooling.dependencies.lefthook)
const settings = {
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
  '--outfile=dist/create-solid.mjs'
])
const executableMode = 0o755
chmodSync('dist/create-solid.mjs', executableMode)
const sourceTree = execFileSync('git', ['rev-parse', 'HEAD:apps/boilerplate'], {
  encoding: 'utf8'
})
if (sourceTree !== readFileSync('app-tree.txt', 'utf8')) {
  throw new Error('Update app-tree.txt with the reviewed application tree')
}
for (const pm of ['bun', 'pnpm', 'npm']) {
  const profile = path.resolve('dist/profiles', pm)
  const patchTest = 'tooling/__tests__/patched-dependencies.test.ts'
  const documents = files.filter(
    file => rules.get(file) === 'rewrite' && file.endsWith('.md')
  )
  for (const file of [...documents, patchTest]) {
    const target = path.join(profile, file)
    mkdirSync(path.dirname(target), { recursive: true })
    cpSync(path.join(app, file), target)
  }
  rewriteDocuments({ dir: profile, pm, version: settings.version })
  rewritePatchTest({ dir: profile, pm, patches: settings.patches })
  for (const file of [...documents, patchTest]) {
    const target = path.join(profile, file)
    const content = readFileSync(target)
    if (content.equals(readFileSync(path.join(app, file)))) {
      rmSync(target)
    } else if (file !== 'AGENTS.md') {
      writeFileSync(
        target,
        execFileSync('vp', ['fmt', `--stdin-filepath=${file}`], {
          cwd: root,
          input: content
        })
      )
    }
  }
}
