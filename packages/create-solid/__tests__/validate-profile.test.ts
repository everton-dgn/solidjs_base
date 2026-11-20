import assert from 'node:assert/strict'
import { it } from 'node:test'

import { validateProfile } from '../src/validateProfile/index.ts'

void it('returns field codes and interpolation values before generation', () => {
  const { problems } = validateProfile({
    name: 'sample',
    mode: 'invalid',
    pm: 'other',
    title: '',
    i18n: true,
    'no-i18n': true,
    seo: false,
    'no-seo': true,
    'site-url': 'https://example.org'
  })
  assert.deepEqual(
    problems.map(({ field, code, values }) => ({ field, code, values })),
    [
      { field: 'mode', code: 'invalid', values: { flag: '--mode' } },
      { field: 'pm', code: 'invalid', values: { flag: '--pm' } },
      { field: 'i18n', code: 'conflict', values: { value: 'i18n' } },
      { field: 'title', code: 'badTitle', values: {} },
      { field: 'site-url', code: 'needsSeo', values: {} }
    ]
  )
})

void it('identifies malformed project and base language tags independently', () => {
  const { problems } = validateProfile({
    name: 'sample',
    locales: 'en,bad_tag',
    'base-locale': 'also_invalid'
  })
  assert.deepEqual(
    problems.map(({ field, code, values }) => ({ field, code, values })),
    [
      {
        field: 'locales',
        code: 'tag',
        values: { flag: '--locales', value: 'bad_tag' }
      },
      {
        field: 'base-locale',
        code: 'tag',
        values: { flag: '--base-locale', value: 'also_invalid' }
      }
    ]
  )
})
