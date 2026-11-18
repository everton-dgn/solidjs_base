import assert from 'node:assert/strict'
import { it } from 'node:test'

void it('exports the generator without parsing process arguments', async () => {
  const generator = await import('../src/generate.ts')
  assert.equal(typeof generator.generate, 'function')
})
