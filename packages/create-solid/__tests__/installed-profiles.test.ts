import assert from 'node:assert/strict'
import { it } from 'node:test'

import scenarios from '../tooling/scenarios.json' with { type: 'json' }

const flags = (name: string) =>
  scenarios.find(scenario => scenario.name === name)?.flags

void it('installs the default Bun server and both reduced language profiles', () => {
  assert.deepEqual(flags('bun'), [])
  assert.deepEqual(flags('server-without-theme'), [
    '--no-theme',
    '--locales',
    'pt-BR,es'
  ])
  assert.deepEqual(flags('server-without-ui-features'), [
    '--no-seo',
    '--no-theme',
    '--no-fonts',
    '--no-icons',
    '--locales',
    'pt-BR'
  ])
  assert.deepEqual(flags('static-seeded-locales'), [
    '--mode',
    'static',
    '--locales',
    'fr,ja',
    '--base-locale',
    'ja'
  ])
})
