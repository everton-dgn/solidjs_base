import assert from 'node:assert/strict'
import { it } from 'node:test'

void it('exports the generator without parsing process arguments', async () => {
  const generator = await import('../src/generate.ts')
  assert.equal(typeof generator.generate, 'function')
})

void it('keeps the generator private until its first registry release', async () => {
  const { readFile } = await import('node:fs/promises')
  const read = async (file: string) => JSON.parse(await readFile(file, 'utf8'))
  assert.equal((await read('package.json')).private, true)
  const config = await read('../../release-please-config.json')
  assert.ok(!Object.hasOwn(config.packages, 'packages/create-solid'))
  assert.ok(!config.plugins[0].components.includes('create-solid'))
  assert.ok(!Object.hasOwn(await read('../../.release-please-manifest.json'), 'packages/create-solid'))
})
