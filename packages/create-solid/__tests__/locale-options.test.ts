import assert from 'node:assert/strict'
import { it } from 'node:test'

import { resolveLocaleOptions } from '../src/locale-options.ts'
import type { Profile } from '../src/types.ts'

const defaults = { baseLocale: 'en', locales: ['pt', 'en', 'es'] }
const resolve = (options: Partial<Profile>) =>
  resolveLocaleOptions({ options, defaults })

void it('uses the template settings on a host and the base language on a client', () => {
  for (const mode of ['server', 'static'] as const) {
    assert.deepEqual(resolve({ mode }), defaults)
  }
  assert.deepEqual(resolve({ mode: 'client' }), {
    baseLocale: 'en',
    locales: ['en']
  })
  assert.deepEqual(resolve({ mode: 'client', baseLocale: 'zh-hant-tw' }), {
    baseLocale: 'zh-Hant-TW',
    locales: ['zh-Hant-TW']
  })
})

void it('canonicalizes tags without moving an explicit base or guessing a region', () => {
  const locales = ['fr', 'JA']
  assert.deepEqual(resolve({ locales }), {
    locales: ['fr', 'ja'],
    baseLocale: 'fr'
  })
  assert.deepEqual(resolve({ locales, baseLocale: 'ja' }), {
    locales: ['fr', 'ja'],
    baseLocale: 'ja'
  })
  assert.deepEqual(resolve({ hasI18n: false, baseLocale: 'es-mx' }), {
    locales: ['es-MX'],
    baseLocale: 'es-MX'
  })
})

void it('rejects contradictory or malformed locale options with the flag name', () => {
  for (const locales of [
    [],
    [''],
    ['en', ' '],
    ['en', 'EN'],
    ['en_US'],
    ['iw', 'he']
  ]) {
    assert.throws(() => resolve({ locales }), /--locales/u)
  }
  assert.throws(
    () => resolve({ locales: ['fr'], baseLocale: 'ja' }),
    /--base-locale/u
  )
  assert.throws(() => resolve({ baseLocale: '_' }), /--base-locale/u)
  assert.throws(
    () => resolve({ hasI18n: false, locales: ['en'] }),
    /--locales/u
  )
  assert.throws(
    () => resolve({ mode: 'client', locales: ['fr', 'ja'] }),
    /--mode static/u
  )
})
