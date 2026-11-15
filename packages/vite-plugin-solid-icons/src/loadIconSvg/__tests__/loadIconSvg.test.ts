import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, type TestContext } from 'node:test'
import { promisify } from 'node:util'

import { compileIcon } from '../../compileIcon/index.ts'
import { createNameTables } from '../../iconCollections/index.ts'
import type { IconCustomizer } from '../../types.ts'
import { loadIconSvg } from '../index.ts'

type CustomizedAttribute = [
  attributes: Record<string, unknown>,
  message: RegExp
]
type IconFolder = NonNullable<Parameters<typeof loadIconSvg>[0]['folder']>

type OddIcon = { root: string; name: string }

type FolderIcon = {
  context: TestContext
  name: string
  customizeIcon?: IconCustomizer
}

// The package installs @iconify-json/hugeicons for its tests.
const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../../..')
const STAR =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0"/></svg>'
const SECRET_SVG = '<svg><text>secret</text></svg>'
const REPLACED_FOLDER =
  /The folder "[^"]+" of the icon collection "own" was replaced, or a folder above it was, after the plugin read it first: stop and start the dev server or the build to read the new folder\./u

// A folder with a star.svg that is not the icon, in place of the folder of
// the collection.
async function secretFolder(folder: string): Promise<void> {
  await mkdir(folder, { recursive: true })
  await writeFile(path.join(folder, 'star.svg'), SECRET_SVG)
}

function loadStar(folder: IconFolder) {
  return loadIconSvg({
    collection: 'own',
    name: 'star',
    root: path.dirname(folder.path),
    folder,
    customizeIcon: undefined
  })
}

async function iconFolder(context: TestContext): Promise<string> {
  const prefix = path.join(tmpdir(), 'solid-icons-folder-')
  const folder = await realpath(await mkdtemp(prefix))
  context.after(() => rm(folder, { recursive: true, force: true }))
  await writeFile(path.join(folder, 'star.svg'), STAR)
  await writeFile(path.join(folder, 'logo.v2.svg'), STAR)
  return folder
}

// The folder as the plugin passes it: listed once, and listed again by
// refresh.
async function listed(folder: string): Promise<IconFolder> {
  const root = path.dirname(folder)
  const tables = createNameTables({ root, folders: new Map([['own', folder]]) })
  return {
    path: folder,
    files: await tables.files('own'),
    refresh: () => tables.refresh('own')
  }
}

// Reads the SVG of star.svg as the plugin does: each read takes the listing
// that the tables keep now, which a refresh replaces.
async function pluginReads(folder: string) {
  const tables = createNameTables({
    root: path.dirname(folder),
    folders: new Map([['own', folder]])
  })
  await tables.files('own')
  return async () => {
    const { svg } = await loadStar({
      path: folder,
      files: await tables.files('own'),
      refresh: () => tables.refresh('own')
    })
    return svg
  }
}

function loadInstalled(name: string) {
  return loadIconSvg({
    collection: 'hugeicons',
    name,
    root: PACKAGE_ROOT,
    folder: undefined,
    customizeIcon: undefined
  })
}

// A collection of the application with the names that @iconify/utils looks
// up as icons[name], where a member of every object would answer.
const ODD_SET = {
  prefix: 'odd',
  width: 24,
  height: 24,
  icons: {
    real: { body: '<path d="M0 0"/>' },
    constructor: { body: '<path d="M1 1"/>' },
    bodiless: {},
    // A valid body that @iconify/utils cannot draw.
    weird: { body: '<path/>', hFlip: true, left: { toString: null } }
  },
  aliases: {
    hasOwnProperty: { parent: 'real' },
    builder: { parent: 'constructor' },
    ghost: { parent: 'toString' },
    flipped: { parent: 'valueOf', hFlip: true },
    loop: { parent: 'loop-back' },
    'loop-back': { parent: 'loop' },
    dangling: { parent: 'no-such-icon' },
    empty: { parent: 'bodiless' }
  }
}

async function oddRoot(context: TestContext): Promise<string> {
  const prefix = path.join(tmpdir(), 'solid-icons-odd-')
  const root = await realpath(await mkdtemp(prefix))
  context.after(() => rm(root, { recursive: true, force: true }))
  const folder = path.join(root, 'node_modules/@iconify-json/odd')
  await mkdir(folder, { recursive: true })
  await writeFile(path.join(folder, 'icons.json'), JSON.stringify(ODD_SET))
  await writeFile(
    path.join(folder, 'package.json'),
    '{"name":"@iconify-json/odd","version":"0.0.0"}'
  )
  return root
}

function loadOdd({ root, name }: OddIcon) {
  return loadIconSvg({
    collection: 'odd',
    name,
    root,
    folder: undefined,
    customizeIcon: undefined
  })
}

async function loadFolderIcon({ context, ...icon }: FolderIcon) {
  const folder = await iconFolder(context)
  const loaded = await loadIconSvg({
    collection: 'own',
    root: path.dirname(folder),
    folder: await listed(folder),
    customizeIcon: undefined,
    ...icon
  })
  return { ...loaded, folder }
}

describe('loadIconSvg', () => {
  it('loads an icon of an installed collection at 1.2em', async () => {
    const { svg, file } = await loadIconSvg({
      collection: 'hugeicons',
      name: 'github',
      root: PACKAGE_ROOT,
      folder: undefined,
      customizeIcon: undefined
    })

    assert.match(
      svg,
      /^<svg viewBox="0 0 24 24" width="1.2em" height="1.2em" >/u
    )
    assert.match(svg, /stroke="currentColor"/u)
    assert.equal(file, undefined)
  })

  it('loads an icon of a folder and reports its file', async context => {
    const { svg, file, folder } = await loadFolderIcon({
      context,
      name: 'star'
    })

    assert.match(svg, /width="1.2em" height="1.2em"/u)
    assert.match(svg, /<path d="M0 0"\/>/u)
    assert.equal(file, path.join(folder, 'star.svg'))
  })

  it('loads a name with a dot from its file', async context => {
    const { file, folder } = await loadFolderIcon({
      context,
      name: 'logo.v2'
    })

    assert.equal(file, path.join(folder, 'logo.v2.svg'))
  })

  it('passes the attributes of every icon to the customizer', async context => {
    const seen: string[] = []
    const customizeIcon: IconCustomizer = ({
      collection,
      name,
      attributes
    }) => {
      seen.push(`${collection}/${name}`)
      attributes['aria-hidden'] = 'true'
    }
    const folderIcon = await loadFolderIcon({
      context,
      name: 'star',
      customizeIcon
    })
    const installed = await loadIconSvg({
      collection: 'hugeicons',
      name: 'github',
      root: PACKAGE_ROOT,
      folder: undefined,
      customizeIcon
    })

    assert.match(folderIcon.svg, /^<svg aria-hidden="true" /u)
    assert.match(
      installed.svg,
      /^<svg viewBox="0 0 24 24" aria-hidden="true" /u
    )
    assert.deepEqual(seen, ['own/star', 'hugeicons/github'])
  })

  it('names the missing icon of a folder', async context => {
    const folder = await iconFolder(context)

    await assert.rejects(
      loadIconSvg({
        collection: 'own',
        name: 'moon',
        root: path.dirname(folder),
        folder: await listed(folder),
        customizeIcon: undefined
      }),
      {
        message: `Icon "own/moon" not found: the folder "${path.basename(folder)}" of the collection "own" has no moon.svg.`
      }
    )
  })

  it('names the missing icon of an installed collection', async () => {
    await assert.rejects(
      loadIconSvg({
        collection: 'hugeicons',
        name: 'no-such-icon',
        root: PACKAGE_ROOT,
        folder: undefined,
        customizeIcon: undefined
      }),
      {
        message:
          'Icon "hugeicons/no-such-icon" not found in @iconify-json/hugeicons.'
      }
    )
  })

  it('finds no icon in the members of an object', async () => {
    for (const name of [
      'constructor',
      '__proto__',
      'toString',
      'hasOwnProperty',
      'valueOf'
    ]) {
      await assert.rejects(
        loadIconSvg({
          collection: 'hugeicons',
          name,
          root: PACKAGE_ROOT,
          folder: undefined,
          customizeIcon: undefined
        }),
        {
          message: `Icon "hugeicons/${name}" not found in @iconify-json/hugeicons.`
        }
      )
    }
  })

  it('finds no icon through a chain that leaves the own names', async context => {
    const root = await oddRoot(context)
    for (const name of [
      'ghost',
      'flipped',
      'loop',
      'dangling',
      'bodiless',
      'empty',
      'toString'
    ]) {
      await assert.rejects(loadOdd({ root, name }), {
        message: `Icon "odd/${name}" not found in @iconify-json/odd.`
      })
    }
  })

  it('loads an alias or an icon named as a member of an object', async context => {
    const root = await oddRoot(context)
    const drawn = {
      hasOwnProperty: 'M0 0',
      constructor: 'M1 1',
      builder: 'M1 1'
    }
    for (const [name, pathData] of Object.entries(drawn)) {
      const { svg } = await loadOdd({ root, name })

      assert.match(svg, new RegExp(`<path d="${pathData}"/></svg>$`, 'u'), name)
      assert.doesNotMatch(svg, /undefined/u, name)
    }
  })

  it('names the icon that @iconify/utils cannot draw', async context => {
    const root = await oddRoot(context)

    await assert.rejects(loadOdd({ root, name: 'weird' }), {
      message:
        'Icon "odd/weird" cannot be drawn: Cannot convert object to primitive value'
    })
  })

  it('loads an installed icon by its exact name only', async () => {
    await loadInstalled('first-bracket')
    for (const name of ['firstBracket', 'FirstBracket', 'first_bracket']) {
      await assert.rejects(loadInstalled(name), {
        message: `Icon "hugeicons/${name}" not found in @iconify-json/hugeicons.`
      })
    }
  })

  it('names the collection that is neither installed nor declared', async () => {
    await assert.rejects(
      loadIconSvg({
        collection: 'not-installed',
        name: 'github',
        root: PACKAGE_ROOT,
        folder: undefined,
        customizeIcon: undefined
      }),
      {
        message:
          'Icon collection "not-installed" not found: install @iconify-json/not-installed or declare "not-installed" in the collections option of solidIcons.'
      }
    )
  })
})

describe('loadIconSvg of a folder', () => {
  it('reads only the file with the exact name of the import', async context => {
    const load = async (name: string) => {
      const { file } = await loadFolderIcon({ context, name })
      return file
    }

    // The same error on every file system, so an import that works on
    // macOS also works on Linux.
    await assert.rejects(
      load('STAR'),
      /Icon "own\/STAR" not found: the folder "[^"]+" of the collection "own" has no STAR\.svg; names are case-sensitive, and the folder has star\.svg\./u
    )
  })

  it('does not follow a link to a file outside the folder', async context => {
    const folder = await iconFolder(context)
    const outside = path.join(
      path.dirname(folder),
      `${path.basename(folder)}-secret.svg`
    )
    await writeFile(outside, '<svg><text>secret</text></svg>')
    context.after(() => rm(outside, { force: true }))
    await symlink(outside, path.join(folder, 'link.svg'))
    const icons = await listed(folder)

    assert.deepEqual([...icons.files.links], ['link'])
    assert.equal(icons.files.icons.has('link'), false)
    await assert.rejects(
      loadIconSvg({
        collection: 'own',
        name: 'link',
        root: path.dirname(folder),
        folder: icons,
        customizeIcon: undefined
      }),
      /link\.svg in the folder "[^"]+" of the collection "own" is a symbolic link, and the plugin reads regular files only\./u
    )
  })

  it('refuses a file that became a link after the listing', async context => {
    const folder = await iconFolder(context)
    const outside = path.join(
      path.dirname(folder),
      `${path.basename(folder)}-secret.svg`
    )
    await writeFile(outside, '<svg><text>secret</text></svg>')
    context.after(() => rm(outside, { force: true }))
    const icons = await listed(folder)
    await rm(path.join(folder, 'star.svg'))
    await symlink(outside, path.join(folder, 'star.svg'))

    assert.equal(icons.files.icons.has('star'), true)
    await assert.rejects(
      loadIconSvg({
        collection: 'own',
        name: 'star',
        root: path.dirname(folder),
        folder: icons,
        customizeIcon: undefined
      }),
      /star\.svg in the folder "[^"]+" of the collection "own" is a symbolic link, and the plugin reads regular files only\./u
    )
  })

  it('refuses a file that became a FIFO after the listing', async context => {
    const folder = await iconFolder(context)
    const icons = await listed(folder)
    await rm(path.join(folder, 'star.svg'))
    await promisify(execFile)('mkfifo', [path.join(folder, 'star.svg')])

    // Without a writer, a blocking open of the FIFO would never return.
    await assert.rejects(
      loadIconSvg({
        collection: 'own',
        name: 'star',
        root: path.dirname(folder),
        folder: icons,
        customizeIcon: undefined
      }),
      /star\.svg in the folder "[^"]+" of the collection "own" is not a regular file, and the plugin reads regular files only\./u
    )
  })
  it('reads the files of a folder that is a link', async context => {
    const folder = await iconFolder(context)
    const linked = `${folder}-link`
    await symlink(folder, linked)
    context.after(() => rm(linked, { force: true }))
    const { svg } = await loadIconSvg({
      collection: 'own',
      name: 'star',
      root: path.dirname(folder),
      folder: await listed(linked),
      customizeIcon: undefined
    })

    assert.match(svg, /<path d="M0 0"\/>/u)
  })

  it('adds the attributes to an <svg> without attributes', async context => {
    const folder = await iconFolder(context)
    await writeFile(
      path.join(folder, 'bare.svg'),
      '<svg><path d="M0 0"/></svg>'
    )
    const { svg } = await loadIconSvg({
      collection: 'own',
      name: 'bare',
      root: path.dirname(folder),
      folder: await listed(folder),
      customizeIcon: ({ attributes }) => {
        attributes['aria-hidden'] = 'true'
      }
    })

    assert.equal(
      svg,
      '<svg aria-hidden="true" width="1.2em" height="1.2em" ><path d="M0 0"/></svg>'
    )
  })

  it('escapes the values that the customizer sets', async context => {
    const title = 'a "b" <c> & d'
    const { svg } = await loadFolderIcon({
      context,
      name: 'star',
      customizeIcon: ({ attributes }) => {
        attributes['aria-label'] = title
      }
    })
    const { code: component } = compileIcon({
      svg,
      isRaw: false,
      icon: 'own/star'
    })

    assert.match(svg, /aria-label="a &quot;b&quot; &lt;c&gt; &amp; d"/u)
    assert.match(component, /aria-label=\{"a \\"b\\" <c> & d"\}/u)
  })

  it('names an attribute that the customizer cannot set', async context => {
    const cases: CustomizedAttribute[] = [
      [
        { 'a b': 'x' },
        /customizeIcon set the attribute "a b" on the icon "own\/star": an attribute name starts with a letter or "_"/u
      ],
      [
        { 'x"': 'x' },
        /customizeIcon set the attribute "x"" on the icon "own\/star"/u
      ],
      [
        { width: 2 },
        /customizeIcon set the attribute width of the icon "own\/star" to a number: an attribute value is a string\./u
      ]
    ]
    for (const [set, message] of cases) {
      await assert.rejects(
        loadFolderIcon({
          context,
          name: 'star',
          customizeIcon: ({ attributes }) => {
            Object.assign(attributes, set)
          }
        }),
        message
      )
    }
    const { svg } = await loadFolderIcon({
      context,
      name: 'star',
      customizeIcon: ({ attributes }) => {
        Object.assign(attributes, { onload: 'alert(1)' })
      }
    })
    assert.throws(
      () => compileIcon({ svg, isRaw: true, icon: 'own/star' }),
      /the attribute onload of <svg> is an event handler, which runs code/u
    )
  })
})

describe('loadIconSvg of a folder that changes after the listing', () => {
  it('refuses a folder replaced after the listing', async context => {
    const folder = await iconFolder(context)
    const readStar = await pluginReads(folder)
    const other = `${folder}-other`
    context.after(() => rm(other, { recursive: true, force: true }))
    await secretFolder(other)

    // By a link to another folder.
    await rename(folder, `${folder}-old`)
    context.after(() => rm(`${folder}-old`, { recursive: true, force: true }))
    await symlink(other, folder)
    await assert.rejects(readStar(), REPLACED_FOLDER)
    await assert.rejects(readStar(), REPLACED_FOLDER)
    // By another folder of the same name.
    await rm(folder)
    await secretFolder(folder)
    await assert.rejects(readStar(), REPLACED_FOLDER)
    await assert.rejects(readStar(), REPLACED_FOLDER)
  })

  it('refuses a folder moved and replaced by a link to it', async context => {
    const folder = await iconFolder(context)
    const readStar = await pluginReads(folder)
    const moved = `${folder}-moved`
    context.after(() => rm(moved, { recursive: true, force: true }))

    // The file keeps its device and inode; the path of the folder does not.
    await rename(folder, moved)
    await symlink(moved, folder)
    await assert.rejects(readStar(), REPLACED_FOLDER)
    await assert.rejects(readStar(), REPLACED_FOLDER)
    // The folder put back is the one that the plugin read first.
    await rm(folder)
    await rename(moved, folder)
    assert.match(await readStar(), /<path d="M0 0"\/>/u)
  })

  it('refuses a folder whose parent was replaced after the listing', async context => {
    const parent = await iconFolder(context)
    const folder = path.join(parent, 'brand/icons')
    await mkdir(folder, { recursive: true })
    await writeFile(path.join(folder, 'star.svg'), STAR)
    const readStar = await pluginReads(folder)

    await rename(path.join(parent, 'brand'), path.join(parent, 'brand-old'))
    await secretFolder(path.join(parent, 'other/icons'))
    await symlink(path.join(parent, 'other'), path.join(parent, 'brand'))
    await assert.rejects(readStar(), REPLACED_FOLDER)
    await assert.rejects(readStar(), REPLACED_FOLDER)
  })

  it('refuses a folder whose parent was moved and replaced by a link to it', async context => {
    const parent = await iconFolder(context)
    const folder = path.join(parent, 'brand/icons')
    await mkdir(folder, { recursive: true })
    await writeFile(path.join(folder, 'star.svg'), STAR)
    const readStar = await pluginReads(folder)

    await rename(path.join(parent, 'brand'), path.join(parent, 'brand-moved'))
    await symlink(path.join(parent, 'brand-moved'), path.join(parent, 'brand'))
    await assert.rejects(readStar(), REPLACED_FOLDER)
    await assert.rejects(readStar(), REPLACED_FOLDER)
    await rm(path.join(parent, 'brand'))
    await rename(path.join(parent, 'brand-moved'), path.join(parent, 'brand'))
    assert.match(await readStar(), /<path d="M0 0"\/>/u)
  })

  it('refuses a folder link pointed to another folder after the listing', async context => {
    const folder = await iconFolder(context)
    const copy = `${folder}-copy`
    context.after(() => rm(copy, { recursive: true, force: true }))
    await mkdir(copy)
    await writeFile(path.join(copy, 'star.svg'), STAR)
    const linked = `${folder}-link`
    context.after(() => rm(linked, { force: true }))
    await symlink(folder, linked)
    const readStar = await pluginReads(linked)
    assert.match(await readStar(), /<path d="M0 0"\/>/u)

    // The link leads to another folder now, with the same files.
    await rm(linked)
    await symlink(copy, linked)
    await assert.rejects(readStar(), REPLACED_FOLDER)
    await assert.rejects(readStar(), REPLACED_FOLDER)
  })

  it('reads a file replaced by a hard link as the file it is', async context => {
    const folder = await iconFolder(context)
    const outside = `${folder}-other.svg`
    await writeFile(outside, SECRET_SVG)
    context.after(() => rm(outside, { force: true }))
    const readStar = await pluginReads(folder)
    await rm(path.join(folder, 'star.svg'))
    await link(outside, path.join(folder, 'star.svg'))

    // A hard link needs a write in the folder, as a new SVG does.
    assert.match(await readStar(), /<text>secret<\/text>/u)
    assert.match(await readStar(), /<text>secret<\/text>/u)
  })

  it('reads a file that an editor saved to a new file', async context => {
    const folder = await iconFolder(context)
    const readStar = await pluginReads(folder)
    for (const shape of ['M2 2', 'M3 3']) {
      const saved = STAR.replace('M0 0', shape)
      const drawn = new RegExp(`<path d="${shape}"/>`, 'u')
      // The editor writes a new file and renames it over the icon.
      await writeFile(path.join(folder, '.star.svg.swp'), saved)
      await rename(
        path.join(folder, '.star.svg.swp'),
        path.join(folder, 'star.svg')
      )

      assert.match(await readStar(), drawn)
      assert.match(await readStar(), drawn)
      assert.equal(await readFile(path.join(folder, 'star.svg'), 'utf8'), saved)
    }
  })

  it('refuses a file replaced again while the folder is listed again', async context => {
    const folder = await iconFolder(context)
    const tables = createNameTables({
      root: path.dirname(folder),
      folders: new Map([['own', folder]])
    })
    const files = await tables.files('own')
    const save = async (shape: string) => {
      await writeFile(
        path.join(folder, '.star.svg.swp'),
        STAR.replace('M0 0', shape)
      )
      await rename(
        path.join(folder, '.star.svg.swp'),
        path.join(folder, 'star.svg')
      )
    }
    await save('M2 2')

    // The file that the read opened is gone when the folder is listed again.
    await assert.rejects(
      loadStar({
        path: folder,
        files,
        refresh: async () => {
          await save('M3 3')
          return tables.refresh('own')
        }
      }),
      /star\.svg in the folder "[^"]+" of the collection "own" was replaced while the plugin read it, and the plugin reads only the file that the listing of the folder has\./u
    )
  })
})
