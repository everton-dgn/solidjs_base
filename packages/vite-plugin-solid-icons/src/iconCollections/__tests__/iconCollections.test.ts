import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, type TestContext } from 'node:test'

import { loadIconSvg } from '../../loadIconSvg/index.ts'
import {
  createNameTables,
  declaredCollections,
  resolveFolders
} from '../index.ts'

type Files = Record<string, string>
type FolderInput = { context: TestContext; files: Files }
type DrawingInput = { root: string; name: string }
type IconSetCase = {
  icons: Record<string, { body: string }>
  aliases: Record<string, { parent: string }>
  exports: Record<string, string>
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"/>'
const BODY = { body: '<path d="M0 0h24v24H0z"/>' }
const DEMO_SET = {
  prefix: 'demo',
  icons: { star: BODY, 'arrow-left': BODY },
  aliases: {
    // An alias of an alias draws the same SVG as the icon.
    'star-filled': { parent: 'star' },
    'star-full': { parent: 'star-filled' },
    // A flipped alias is an icon of its own.
    'arrow-right': { parent: 'arrow-left', hFlip: true },
    missing: { parent: 'no-such-icon' }
  }
}

async function drawing({ root, name }: DrawingInput): Promise<string> {
  const { svg } = await loadIconSvg({
    collection: 'odd',
    name,
    root,
    folder: undefined,
    customizeIcon: undefined
  })
  return svg
}

function exportName(name: string): string {
  return name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

async function folderWith({ context, files }: FolderInput): Promise<string> {
  const prefix = path.join(tmpdir(), 'solid-icons-collections-')
  const folder = await realpath(await mkdtemp(prefix))
  context.after(() => rm(folder, { recursive: true, force: true }))
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(folder, file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
  }
  return folder
}

describe('createNameTables', () => {
  it('reads the icons and the aliases of an installed collection', async context => {
    const root = await folderWith({
      context,
      files: {
        'node_modules/@iconify-json/demo/package.json':
          '{"name":"@iconify-json/demo"}',
        'node_modules/@iconify-json/demo/icons.json': JSON.stringify(DEMO_SET)
      }
    })
    const table = await createNameTables({ root, folders: new Map() }).get(
      'demo'
    )

    assert.deepEqual(Object.fromEntries(table.exports), {
      ArrowLeft: 'arrow-left',
      ArrowRight: 'arrow-right',
      Star: 'star',
      StarFilled: 'star',
      StarFull: 'star'
    })
  })

  it('follows an alias to an icon named as a member of an object', async context => {
    const iconSet = {
      prefix: 'odd',
      icons: { constructor: BODY },
      aliases: {
        builder: { parent: 'constructor' },
        ghost: { parent: 'toString' }
      }
    }
    const root = await folderWith({
      context,
      files: {
        'node_modules/@iconify-json/odd/package.json':
          '{"name":"@iconify-json/odd"}',
        'node_modules/@iconify-json/odd/icons.json': JSON.stringify(iconSet)
      }
    })
    const table = await createNameTables({ root, folders: new Map() }).get(
      'odd'
    )

    assert.deepEqual(Object.fromEntries(table.exports), {
      Builder: 'constructor',
      Constructor: 'constructor'
    })
  })

  it('keeps an alias named __proto__', async context => {
    // JSON.parse makes __proto__ a key, as this does.
    const aliases = Object.fromEntries([['__proto__', { parent: 'star' }]])
    const iconSet = { prefix: 'odd', icons: { star: BODY }, aliases }
    const root = await folderWith({
      context,
      files: {
        'node_modules/@iconify-json/odd/package.json':
          '{"name":"@iconify-json/odd"}',
        'node_modules/@iconify-json/odd/icons.json': JSON.stringify(iconSet)
      }
    })
    const table = await createNameTables({ root, folders: new Map() }).get(
      'odd'
    )

    assert.deepEqual(Object.fromEntries(table.exports), {
      Proto: 'star',
      Star: 'star'
    })
  })

  it('declares the names of a malformed icons.json that load, and no other', async context => {
    const iconSet = {
      prefix: 'odd',
      icons: {
        real: BODY,
        twin: { body: '<path d="M1 1"/>' },
        bodiless: {},
        numeric: { body: 1 },
        empty: null
      },
      aliases: {
        'real-alias': { parent: 'real' },
        'real-flipped': { parent: 'real', hFlip: true },
        'null-alias': null,
        'number-alias': 3,
        'list-alias': ['real'],
        'numeric-parent': { parent: 5 },
        'to-bodiless': { parent: 'bodiless' },
        'flipped-bodiless': { parent: 'bodiless', vFlip: true },
        'flipped-ghost': { parent: 'valueOf', hFlip: true },
        'through-null': { parent: 'null-alias' },
        dangling: { parent: 'no-such-icon' },
        loop: { parent: 'loop-back' },
        'loop-back': { parent: 'loop' },
        // An icon of the same name loads before the alias.
        twin: { parent: 'real' },
        bodiless: { parent: 'real' }
      }
    }
    const root = await folderWith({
      context,
      files: {
        'node_modules/@iconify-json/odd/package.json':
          '{"name":"@iconify-json/odd"}',
        'node_modules/@iconify-json/odd/icons.json': JSON.stringify(iconSet)
      }
    })
    const table = await createNameTables({ root, folders: new Map() }).get(
      'odd'
    )
    const loads = async (name: string) => {
      try {
        await loadIconSvg({
          collection: 'odd',
          name,
          root,
          folder: undefined,
          customizeIcon: undefined
        })
        return true
      } catch {
        return false
      }
    }
    const names = [
      ...Object.keys(iconSet.icons),
      ...Object.keys(iconSet.aliases)
    ]
    const loaded = []
    for (const name of new Set(names)) if (await loads(name)) loaded.push(name)

    assert.deepEqual(Object.fromEntries(table.exports), {
      Real: 'real',
      RealAlias: 'real',
      RealFlipped: 'real-flipped',
      Twin: 'twin'
    })
    assert.deepEqual(loaded, ['real', 'twin', 'real-alias', 'real-flipped'])
  })

  it('reads the SVG files of a folder collection', async context => {
    const folder = await folderWith({
      context,
      files: {
        'star.svg': SVG,
        'logo.v2.svg': SVG,
        'notes.txt': 'not an icon',
        '.hidden.svg': SVG,
        'two words.svg': SVG
      }
    })
    const table = await createNameTables({
      root: folder,
      folders: new Map([['own', folder]])
    }).get('own')

    assert.deepEqual([...table.exports.keys()].toSorted(), ['LogoV2', 'Star'])
  })

  it('reads the folder again after invalidate', async context => {
    const folder = await folderWith({ context, files: { 'star.svg': SVG } })
    const tables = createNameTables({
      root: folder,
      folders: new Map([['own', folder]])
    })
    await tables.get('own')
    await writeFile(path.join(folder, 'moon.svg'), SVG)

    const cached = await tables.get('own')
    tables.invalidate('own')
    const read = await tables.get('own')

    assert.equal(cached.exports.has('Moon'), false)
    assert.equal(read.exports.has('Moon'), true)
  })

  it('names a missing folder and a missing collection', async context => {
    const root = await folderWith({ context, files: {} })
    const tables = createNameTables({
      root,
      folders: new Map([['own', path.join(root, 'icons')]])
    })

    await assert.rejects(tables.get('own'), {
      message:
        'The folder "icons" of the icon collection "own" cannot be read (ENOENT).'
    })
    await assert.rejects(
      tables.get('not-installed'),
      /Icon collection "not-installed" not found: install @iconify-json\/not-installed/u
    )
  })
})

describe('the exports of an installed collection', () => {
  it('loads by export name the icon that each name loads by path', async context => {
    const real = { body: '<path d="M1 1"/>' }
    const twin = { body: '<path d="M2 2"/>' }
    const cases: IconSetCase[] = [
      {
        // An icon wins over an alias of its name, also as the parent of an
        // alias.
        icons: { real, twin },
        aliases: { twin: { parent: 'real' }, 'to-twin': { parent: 'twin' } },
        exports: { Real: 'real', ToTwin: 'twin', Twin: 'twin' }
      },
      {
        icons: { a: real },
        aliases: { a: { parent: 'b' }, b: { parent: 'a' }, c: { parent: 'b' } },
        exports: { A: 'a', B: 'a', C: 'a' }
      },
      {
        // No import spells the icon, so its aliases load it themselves.
        icons: { real, 'two words': twin },
        aliases: {
          spaced: { parent: 'two words' },
          'to-spaced': { parent: 'spaced' }
        },
        exports: { Real: 'real', Spaced: 'spaced', ToSpaced: 'to-spaced' }
      }
    ]
    for (const { icons, aliases, exports } of cases) {
      const iconSet = { prefix: 'odd', icons, aliases }
      const root = await folderWith({
        context,
        files: {
          'node_modules/@iconify-json/odd/package.json':
            '{"name":"@iconify-json/odd"}',
          'node_modules/@iconify-json/odd/icons.json': JSON.stringify(iconSet)
        }
      })
      const table = await createNameTables({ root, folders: new Map() }).get(
        'odd'
      )
      const names = new Set([...Object.keys(icons), ...Object.keys(aliases)])
      const spelled = [...names].filter(name => /^[a-z-]+$/u.test(name))

      assert.deepEqual(Object.fromEntries(table.exports), exports)
      for (const name of spelled) {
        const module = table.exports.get(exportName(name))
        assert.ok(module !== undefined, name)
        const byName = await drawing({ root, name: module })
        const byPath = await drawing({ root, name })

        assert.equal(byName, byPath, name)
      }
    }
  })
})

describe('resolveFolders', () => {
  it('resolves the folders from the root', () => {
    assert.deepEqual(
      resolveFolders({ root: '/app', collections: { own: './icons' } }),
      new Map([['own', path.resolve('/app/icons')]])
    )
  })
})

describe('declaredCollections', () => {
  it('reads the collections of the closest package.json', async context => {
    const root = await folderWith({
      context,
      files: {
        'package.json': JSON.stringify({
          dependencies: { '@iconify-json/mdi': '*', 'solid-js': '*' },
          devDependencies: { '@iconify-json/hugeicons': '*' },
          optionalDependencies: { '@iconify-json/lucide': '*' },
          peerDependencies: { '@iconify-json/mdi': '*' }
        }),
        'src/index.ts': ''
      }
    })

    assert.deepEqual(await declaredCollections(path.join(root, 'src')), [
      'mdi',
      'hugeicons',
      'lucide'
    ])
  })
})
