import assert from 'node:assert/strict'
import { access, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it, type TestContext } from 'node:test'
import { pathToFileURL } from 'node:url'

import { build } from 'vite-plus'

import { solidIcons } from '../index.ts'
import { createFixtureApp, fixtureConfig, TYPES_FILE } from './fixture-app.ts'

type BuildInput = { context: TestContext; source: string }
type EntryInput = { context: TestContext; code: string }
type RenderedLogos = Record<string, string>

// Two files whose names differ by .tsx, as the id of a component ends.
const LOGOS = `import { renderToString } from '@solidjs/web'
import Plain from 'icon:own/logo'
import Dotted from 'icon:own/logo.tsx'
import plainRaw from 'icon:own/logo?raw'
import dottedRaw from 'icon:own/logo.tsx?raw'
import { Logo, LogoTsx } from 'icon:own'

export const logos = () => ({
  plain: renderToString(() => <Plain />),
  dotted: renderToString(() => <Dotted />),
  named: renderToString(() => <Logo />),
  namedDotted: renderToString(() => <LogoTsx />),
  plainRaw,
  dottedRaw
})
`

function isLogos(value: unknown): value is { logos: () => RenderedLogos } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'logos' in value &&
    typeof value.logos === 'function'
  )
}

async function buildEntry({ context, code }: EntryInput): Promise<void> {
  const root = await createFixtureApp()
  context.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(path.join(root, 'entry.js'), code)
  await build({
    ...fixtureConfig({ root, isSsr: false }),
    logLevel: 'silent',
    build: {
      write: false,
      rolldownOptions: { input: path.join(root, 'entry.js') }
    }
  })
}

// Builds an entry that only imports the module, so the error comes from this
// plugin and not from the Solid compiler.
async function buildImport({ context, source }: BuildInput): Promise<void> {
  await buildEntry({ context, code: `import ${JSON.stringify(source)}\n` })
}

describe('solidIcons', () => {
  it('refuses collection names that an import cannot spell', () => {
    assert.throws(
      () =>
        solidIcons({
          collections: { Brand: './brand', ok: './ok', my_icons: './x' }
        }),
      {
        message:
          'solidIcons: the collection names "Brand", "my_icons" must use lowercase letters, digits and single hyphens.'
      }
    )
  })

  it('writes the declarations where typesFile says, or none', async context => {
    const root = await createFixtureApp()
    context.after(() => rm(root, { recursive: true, force: true }))
    const entry = path.join(root, 'entry.js')
    await writeFile(
      entry,
      "import { Star } from 'icon:own'\nconsole.log(Star)\n"
    )
    const custom = path.join(root, 'types/icons.d.ts')
    const buildWith = (typesFile: string | false) =>
      build({
        ...fixtureConfig({ root, isSsr: false, typesFile }),
        logLevel: 'silent',
        build: { write: false, rolldownOptions: { input: entry } }
      })

    await buildWith('types/icons.d.ts')
    assert.match(
      await readFile(custom, 'utf8'),
      /export const Star: IconComponent/u
    )
    await assert.rejects(access(path.join(root, TYPES_FILE)))
    await rm(custom)
    await buildWith(false)
    await assert.rejects(access(custom))
    await assert.rejects(access(path.join(root, TYPES_FILE)))
  })

  it('loads the icon a name ending in .tsx names', async context => {
    const root = await createFixtureApp()
    context.after(() => rm(root, { recursive: true, force: true }))
    const svg = (file: string) =>
      `<svg viewBox="0 0 16 16"><title>${file}</title></svg>`
    await writeFile(path.join(root, 'icons/logo.svg'), svg('logo.svg'))
    await writeFile(path.join(root, 'icons/logo.tsx.svg'), svg('logo.tsx.svg'))
    await writeFile(path.join(root, 'src/logos.tsx'), LOGOS)
    await build({
      ...fixtureConfig({ root, isSsr: true, typesFile: false }),
      logLevel: 'silent',
      build: { ssr: 'src/logos.tsx', outDir: 'dist/server' }
    })
    const module: unknown = await import(
      pathToFileURL(path.join(root, 'dist/server/logos.mjs')).href
    )
    assert.ok(isLogos(module))
    const rendered = module.logos()

    for (const key of ['plain', 'named', 'plainRaw']) {
      assert.match(rendered[key] ?? '', /<title>logo\.svg<\/title>/u, key)
    }
    for (const key of ['dotted', 'namedDotted', 'dottedRaw']) {
      assert.match(rendered[key] ?? '', /<title>logo\.tsx\.svg<\/title>/u, key)
    }
  })

  it('names the missing icon in the build error', async context => {
    await assert.rejects(
      buildImport({ context, source: 'icon:hugeicons/no-such-icon' }),
      /Icon "hugeicons\/no-such-icon" not found in @iconify-json\/hugeicons\./u
    )
  })

  it('names the missing collection in the build error', async context => {
    await assert.rejects(
      buildImport({ context, source: 'icon:not-installed/github' }),
      /Icon collection "not-installed" not found: install @iconify-json\/not-installed/u
    )
  })

  it('names a missing export and suggests the closest one', async context => {
    await assert.rejects(
      buildEntry({
        context,
        code: "import { Githb } from 'icon:hugeicons'\nconsole.log(Githb)\n"
      }),
      /"Githb" is not an icon of 'icon:hugeicons'\. Did you mean Github\?/u
    )
  })

  it('lists the ways to import an ambiguous name', async context => {
    await assert.rejects(
      buildEntry({
        context,
        code: "import { ArrowDown01 } from 'icon:hugeicons'\nconsole.log(ArrowDown01)\n"
      }),
      /"ArrowDown01" names more than one icon of 'icon:hugeicons': import ArrowDown_01 for arrow-down-01, or 'icon:hugeicons\/arrow-down01' for arrow-down01\./u
    )
  })

  it('names a missing export of a folder collection', async context => {
    await assert.rejects(
      buildEntry({
        context,
        code: "import { Sun } from 'icon:own'\nconsole.log(Sun)\n"
      }),
      /"Sun" is not an icon of 'icon:own'\./u
    )
  })

  it('refuses the imports of a whole collection', async context => {
    const cases = [
      [
        'import * as Icons from "icon:hugeicons"\nconsole.log(Icons)',
        /A namespace import of 'icon:hugeicons' is not supported/u
      ],
      [
        'import Icons from "icon:hugeicons"\nconsole.log(Icons)',
        /A default import of 'icon:hugeicons' is not supported/u
      ],
      ['import "icon:hugeicons"', /import 'icon:hugeicons' is not supported/u],
      [
        'export const load = () => import("icon:hugeicons")',
        /import\('icon:hugeicons'\) is not supported/u
      ],
      // The transform reads string literals; the resolver catches the rest.
      [
        'export const load = () => import(`icon:hugeicons`)',
        /import\('icon:hugeicons'\) is not supported/u
      ]
    ] as const
    for (const [code, message] of cases) {
      await assert.rejects(buildEntry({ context, code }), message)
    }
  })
})
