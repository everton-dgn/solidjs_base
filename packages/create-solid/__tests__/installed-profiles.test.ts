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

void it('runs both browser suites for the full app and reduced server profiles', () => {
  const browserProfiles = scenarios.filter(({ tasks }) =>
    tasks.includes('test:e2e')
  )
  assert.deepEqual(
    browserProfiles.map(({ name }) => name),
    [
      'bun',
      'server-without-i18n',
      'server-without-theme',
      'server-without-ui-features'
    ]
  )
  for (const { tasks } of browserProfiles) {
    assert.ok(tasks.includes('test:e2e:production'))
  }
  for (const { tasks } of scenarios) {
    assert.ok(tasks.includes('check:ci'))
    assert.ok(tasks.includes('build'))
  }
  assert.ok(
    scenarios.find(({ name }) => name === 'bun')?.tasks.includes('test:tooling')
  )
})
