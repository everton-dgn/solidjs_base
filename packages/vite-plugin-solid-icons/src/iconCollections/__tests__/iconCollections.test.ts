import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, type TestContext } from 'node:test'

import { createNameTables, resolveFolders } from '../index.ts'

type Files = Record<string, string>
type FolderInput = { context: TestContext; files: Files }

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
      message: 'The folder "icons" of the icon collection "own" cannot be read.'
    })
    await assert.rejects(
      tables.get('not-installed'),
      /Icon collection "not-installed" not found: install @iconify-json\/not-installed/u
    )
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
