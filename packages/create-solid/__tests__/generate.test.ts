import assert from 'node:assert/strict'
import { it } from 'node:test'

import * as v from 'valibot'

void it('exports the generator without parsing process arguments', async () => {
  const entry = import.meta.resolve('@evertondgn/create-solid')
  assert.ok(entry.endsWith('/dist/generate.mjs'))
  const generator: unknown = await import(entry)
  assert.ok(
    typeof generator === 'object' &&
      generator !== null &&
      'generate' in generator
  )
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
