import assert from 'node:assert/strict'
import { it } from 'node:test'

import { cliLanguage, messages } from '../src/cli-language.ts'

void it('selects the interface language independently of the project', () => {
  const environment = {
    LC_ALL: 'es_MX.UTF-8',
    LC_MESSAGES: 'pt_PT',
    LANG: 'en_GB'
  }
  assert.equal(
    cliLanguage({ requested: 'pt_BR', environment, intlLocale: 'en' }),
    'pt-BR'
  )
  assert.equal(cliLanguage({ environment, intlLocale: 'en' }), 'es')
  for (const LC_ALL of ['C', 'POSIX', 'C.UTF-8']) {
    assert.equal(
      cliLanguage({
        environment: { ...environment, LC_ALL },
        intlLocale: 'es'
      }),
      'en'
    )
  }
  assert.equal(
    cliLanguage({ environment: { LANG: 'es' }, intlLocale: 'pt' }),
    'es'
  )
  assert.equal(cliLanguage({ environment: {}, intlLocale: 'pt' }), 'pt-BR')
  assert.equal(cliLanguage({ environment: {}, intlLocale: 'fr' }), 'en')
})

const parameters = (value: string) => value.match(/\{\w+\}/gu)?.toSorted() ?? []

void it('keeps message keys and interpolation parameters in sync', () => {
  for (const catalog of Object.values(messages)) {
    assert.deepEqual(
      Object.keys(catalog).toSorted(),
      Object.keys(messages.en).toSorted()
    )
    for (const [key, value] of Object.entries(messages.en)) {
      assert.deepEqual(
        parameters(
          Object.entries(catalog).find(([name]) => name === key)?.[1] ?? ''
        ),
        parameters(value),
        key
      )
    }
  }
})

void it('mentions the same flags and commands in each translation', () => {
  const tokens = (text: string) =>
    text
      .match(
        /--[\w{}-]+|git init|\{pm\} install|pnpm exec vp fmt pnpm-workspace\.yaml|bunx @evertondgn\/create-solid@latest/gu
      )
      ?.toSorted() ?? []
  for (const catalog of Object.values(messages)) {
    for (const key of Object.keys(
      messages.en
    ) as (keyof typeof messages.en)[]) {
      assert.deepEqual(tokens(catalog[key]), tokens(messages.en[key]), key)
    }
  }
})
