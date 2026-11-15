import assert from 'node:assert/strict'
import fsPromises, {
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, mock, type TestContext } from 'node:test'

import { folderIdentity, readFolderFiles } from '../index.ts'

type Swap = { context: TestContext; swap: () => Promise<void> }

const STAR = '<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>'
const REPLACED_FOLDER =
  /The folder "icons" of the icon collection "own" was replaced, or a folder above it was, after the plugin read it first: stop and start the dev server or the build to read the new folder\./u

async function iconRoot(context: TestContext): Promise<string> {
  const prefix = path.join(tmpdir(), 'solid-icons-listing-')
  const root = await realpath(await mkdtemp(prefix))
  context.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, 'icons'))
  await writeFile(path.join(root, 'icons/star.svg'), STAR)
  return root
}

// WHY: the swap has to land between the two checks of one listing. The
// module reads readdir from node:fs/promises, whose named exports follow
// the object once syncBuiltinESMExports runs.
function swapWhileListing({ context, swap }: Swap): void {
  const { readdir } = fsPromises
  let hasSwapped = false
  mock.method(
    fsPromises,
    'readdir',
    async (...args: Parameters<typeof readdir>) => {
      if (!hasSwapped) {
        hasSwapped = true
        await swap()
      }
      return readdir(...args)
    }
  )
  syncBuiltinESMExports()
  context.after(() => {
    mock.restoreAll()
    syncBuiltinESMExports()
  })
}

describe('readFolderFiles', () => {
  it('refuses a folder replaced while it is listed', async context => {
    const root = await iconRoot(context)
    const folder = path.join(root, 'icons')
    const identity = await folderIdentity(folder)
    swapWhileListing({
      context,
      swap: async () => {
        await rename(folder, path.join(root, 'moved'))
        await symlink(path.join(root, 'moved'), folder)
      }
    })

    await assert.rejects(
      readFolderFiles({ collection: 'own', folder, root, identity }),
      REPLACED_FOLDER
    )
  })

  it('lists the folder that the plugin read first', async context => {
    const root = await iconRoot(context)
    const folder = path.join(root, 'icons')
    const identity = await folderIdentity(folder)
    const files = await readFolderFiles({
      collection: 'own',
      folder,
      root,
      identity
    })

    assert.deepEqual([...files.icons.keys()], ['star'])
    assert.equal(files.identity, identity)
  })
})
