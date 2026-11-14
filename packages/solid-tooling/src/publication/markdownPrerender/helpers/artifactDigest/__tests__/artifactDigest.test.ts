import assert from 'node:assert/strict'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { it } from 'node:test'

import { digestBytes, digestFile, readRouteBytes } from '../index.ts'

// Larger than one read chunk to exercise incremental reads.
const LARGE_BYTES = 200_000

it('computes the file digest matching approved bytes', async context => {
  const dir = await mkdtemp(path.join(tmpdir(), 'artifact-digest-'))
  context.after(() => rm(dir, { recursive: true, force: true }))
  const bytes = new TextEncoder().encode('é'.repeat(LARGE_BYTES))
  const file = path.join(dir, 'page.md')
  await writeFile(file, bytes)
  assert.deepEqual(await digestFile(file), digestBytes(bytes))
  const swapped = bytes.toReversed()
  assert.notEqual(digestBytes(swapped).hash, digestBytes(bytes).hash)
  await symlink(file, path.join(dir, 'link.md'))
  await assert.rejects(digestFile(path.join(dir, 'link.md')), {
    code: process.platform === 'win32' ? 'EPERM' : 'ELOOP'
  })
})

it('uses route bytes rather than decoded text', () => {
  const data = new Uint8Array(Buffer.from('23ff', 'hex')).buffer
  assert.deepEqual(
    readRouteBytes({ route: '/a.md', data, contents: '#�' }),
    new Uint8Array(data)
  )
  assert.deepEqual(readRouteBytes({ route: '/a.md' }), new Uint8Array())
})
