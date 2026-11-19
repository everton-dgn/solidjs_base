import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { it } from 'node:test'

// These digests include the key order from the serial preparation of all profiles.

void it('preserves the serial prepared-guides bytes', () => {
  const bytes = readFileSync('dist/prepared-guides.json')
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    '9854810a9e1c729012276f8e8bd5c94f34ffdd82184028702852eaf52c117ca5'
  )
})

void it('preserves the serial prepared-source bytes', () => {
  const bytes = readFileSync('dist/prepared-source.json')
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    'b2eb54d854a41a80e2ab5ecd9a77552d3293776c48c91626fc86a833e6f6111b'
  )
})
