import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, type TestContext } from 'node:test'

import type { IconCustomizer } from '../../types.ts'
import { loadIconSvg } from '../index.ts'

type FolderIcon = { name: string; customizeIcon?: IconCustomizer }

// The package installs @iconify-json/hugeicons for its tests.
const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../../..')
const STAR =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0"/></svg>'

async function iconFolder(context: TestContext): Promise<string> {
  const prefix = path.join(tmpdir(), 'solid-icons-folder-')
  const folder = await realpath(await mkdtemp(prefix))
  context.after(() => rm(folder, { recursive: true, force: true }))
  await writeFile(path.join(folder, 'star.svg'), STAR)
  await writeFile(path.join(folder, 'logo.v2.svg'), STAR)
  return folder
}

async function loadFolderIcon(context: TestContext, icon: FolderIcon) {
  const folder = await iconFolder(context)
  const loaded = await loadIconSvg({
    collection: 'own',
    root: path.dirname(folder),
    folder,
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
    const { svg, file, folder } = await loadFolderIcon(context, {
      name: 'star'
    })

    assert.match(svg, /width="1.2em" height="1.2em"/u)
    assert.match(svg, /<path d="M0 0"\/>/u)
    assert.equal(file, path.join(folder, 'star.svg'))
  })

  it('loads a name with a dot from its file', async context => {
    const { file, folder } = await loadFolderIcon(context, { name: 'logo.v2' })

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
    const folderIcon = await loadFolderIcon(context, {
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
        folder,
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
