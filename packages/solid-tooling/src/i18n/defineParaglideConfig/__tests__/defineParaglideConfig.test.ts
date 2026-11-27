import assert from 'node:assert/strict'
import { it } from 'node:test'

import { defineParaglideConfig } from '../index.ts'

it('prefixes every locale of the settings in the page URLs', () => {
  const config = defineParaglideConfig(['de', 'fr', 'it', 'ja'])

  assert.deepEqual(config.urlPatterns, [
    {
      pattern: '/',
      localized: [
        ['de', '/de'],
        ['fr', '/fr'],
        ['it', '/it'],
        ['ja', '/ja']
      ]
    },
    {
      pattern: '/:path(.*)?',
      localized: [
        ['de', '/de/:path(.*)?'],
        ['fr', '/fr/:path(.*)?'],
        ['it', '/it/:path(.*)?'],
        ['ja', '/ja/:path(.*)?']
      ]
    }
  ])
  assert.deepEqual(config.strategy, [
    'url',
    'cookie',
    'preferredLanguage',
    'baseLocale'
  ])
})

it('returns a new config on each call, so an override does not leak', () => {
  const first = defineParaglideConfig(['de'])
  first.cookieName = 'lang'

  assert.equal(defineParaglideConfig(['de']).cookieName, 'locale')
})
