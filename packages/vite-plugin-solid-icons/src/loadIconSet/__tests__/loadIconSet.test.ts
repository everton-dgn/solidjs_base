import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, mock } from 'node:test'

import { loadIconSet } from '../index.ts'

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../../..')
const LOADS = 20

describe('loadIconSet', () => {
  it('reads icons.json once for loads that start at once', async context => {
    // A new root, so neither this package nor @iconify/utils has the
    // collection yet.
    const created = await mkdtemp(path.join(tmpdir(), 'solid-icons-set-'))
    const root = await realpath(created)
    context.after(() => rm(root, { recursive: true, force: true }))
    await symlink(
      path.join(PACKAGE_ROOT, 'node_modules'),
      path.join(root, 'node_modules')
    )
    const spy = mock.method(fs.promises, 'readFile')
    context.after(() => {
      spy.mock.restore()
    })

    const sets = await Promise.all(
      Array.from({ length: LOADS }, () =>
        loadIconSet({ collection: 'hugeicons', root })
      )
    )
    const reads = spy.mock.calls.filter(
      ({ arguments: [file] }) =>
        typeof file === 'string' &&
        file.endsWith('@iconify-json/hugeicons/icons.json')
    )

    assert.equal(reads.length, 1)
    assert.ok(sets.every(set => set === sets[0]))
  })

  it('looks a missing collection up again', async () => {
    await assert.rejects(
      loadIconSet({ collection: 'not-installed', root: PACKAGE_ROOT }),
      /Icon collection "not-installed" not found/u
    )
    await assert.rejects(
      loadIconSet({ collection: 'not-installed', root: PACKAGE_ROOT }),
      /Icon collection "not-installed" not found/u
    )
  })
})
