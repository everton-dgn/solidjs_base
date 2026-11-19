import assert from 'node:assert/strict'
import { it } from 'node:test'

import * as v from 'valibot'

void it('exports the generator without parsing process arguments', async () => {
  const entry = import.meta.resolve('@evertondgn/create-solid')
  assert.ok(entry.endsWith('/dist/index.mjs'))
  const generator: unknown = await import(entry)
  assert.ok(
    typeof generator === 'object' &&
      generator !== null &&
      'generate' in generator
  )
  assert.deepEqual(Object.keys(generator), ['generate'])
  assert.equal(typeof generator.generate, 'function')
})

void it('keeps the generator private until its first registry release', async () => {
  const { readFile } = await import('node:fs/promises')
  const read = async (file: string): Promise<unknown> =>
    JSON.parse(await readFile(file, 'utf8'))
  const manifest = v.parse(
    v.object({ private: v.boolean() }),
    await read('package.json')
  )
  assert.equal(manifest.private, true)
  const packages = v.record(v.string(), v.unknown())
  const components = v.array(v.string())
  const plugins = v.array(v.object({ components }))
  const config = v.parse(
    v.object({
      packages,
      plugins
    }),
    await read('../../release-please-config.json')
  )
  assert.ok(!Object.hasOwn(config.packages, 'packages/create-solid'))
  assert.ok(
    config.plugins.every(plugin => !plugin.components.includes('create-solid'))
  )
  const versions = v.parse(
    v.record(v.string(), v.string()),
    await read('../../.release-please-manifest.json')
  )
  assert.ok(!Object.hasOwn(versions, 'packages/create-solid'))
})

void it('returns instructions to API callers and exports the generation steps', async context => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { default: path } = await import('node:path')
  const dir = mkdtempSync(path.join(tmpdir(), 'api-app-'))
  context.after(() => rmSync(dir, { recursive: true, force: true }))
  const api = await import('../src/generate.ts')
  assert.deepEqual(
    api.generate({
      dir,
      pm: 'pnpm',
      shouldInstall: false,
      shouldInitGit: false
    }),
    [
      `Open ${dir}.`,
      'Run pnpm install.',
      'Run pnpm exec vp fmt pnpm-workspace.yaml.',
      'Run vp run dev.'
    ]
  )
})

const stepContext = () => {
  const files = new Map<string, string>()
  const context = {
    profile: {
      dir: 'My App',
      pm: 'pnpm' as const,
      shouldInitGit: false,
      shouldInstall: false
    },
    pkg: {
      name: '',
      scripts: {} as Record<string, string>,
      devDependencies: {} as Record<string, string>
    },
    settings: {
      bunVersion: '1',
      catalog: { lib: '1' },
      versions: { local: '2' },
      overrides: {},
      patches: {},
      bunfig: 'config',
      lefthook: '9'
    },
    write: (file: string, content: string) => {
      files.set(file, content)
    }
  }
  return { context, files }
}

void it('resolves catalog and workspace versions from its context', async () => {
  const { resolveGroup } = await import('../src/generate.ts')
  assert.deepEqual(
    resolveGroup(stepContext().context, {
      lib: 'catalog:',
      local: 'workspace:*'
    }),
    { lib: '1', local: '2' }
  )
})

void it('sets the package identity from the destination', async () => {
  const { rewriteIdentity } = await import('../src/generate.ts')
  const { context } = stepContext()
  rewriteIdentity(context)
  assert.equal(context.pkg.name, 'my-app')
})

void it('writes installer settings through the supplied context', async () => {
  const { configureInstaller } = await import('../src/generate.ts')
  const { context, files } = stepContext()
  configureInstaller(context)
  assert.ok(files.get('pnpm-workspace.yaml')?.includes('patchedDependencies:'))
  assert.equal(files.get('bunfig.toml'), 'config')
})

void it('uses the configured hook version and writes its configuration', async () => {
  const { configureHooks } = await import('../src/generate.ts')
  const { context, files } = stepContext()
  configureHooks(context)
  assert.equal(context.pkg.devDependencies.lefthook, '9')
  assert.ok(files.has('.lefthook.yml'))
})

void it('removes reactivity diagnostics from the application and its guide', async context => {
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { default: path } = await import('node:path')
  const dir = mkdtempSync(path.join(tmpdir(), 'app-diagnostics-'))
  context.after(() => rmSync(dir, { recursive: true, force: true }))
  const { generate } = await import('../src/generate.ts')
  generate({
    dir,
    pm: 'bun',
    diagnostics: false,
    shouldInitGit: false,
    shouldInstall: false
  })
  for (const file of ['package.json', 'docs/development.md']) {
    assert.doesNotMatch(
      readFileSync(path.join(dir, file), 'utf8'),
      /@solidjs\/diagnostics|\/__solid\/diagnostics/u
    )
  }
})

void it('omits the font assets, head links and build option with fonts off', async context => {
  const { existsSync, mkdtempSync, readFileSync, rmSync } =
    await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { default: path } = await import('node:path')
  const dir = mkdtempSync(path.join(tmpdir(), 'app-fonts-'))
  context.after(() => rmSync(dir, { recursive: true, force: true }))
  const { generate } = await import('../src/generate.ts')
  generate({
    dir,
    pm: 'bun',
    fonts: false,
    shouldInstall: false,
    shouldInitGit: false
  })
  assert.equal(existsSync(path.join(dir, 'fonts.ts')), false)
  for (const file of [
    'src/Document.tsx',
    'vite.config.ts',
    'AGENTS.md',
    'docs/ui.md',
    'README.md'
  ]) {
    assert.doesNotMatch(
      readFileSync(path.join(dir, file), 'utf8'),
      /FontLinks|fonts: FONTS|Inter subsets|## Font loading/u
    )
  }
})
