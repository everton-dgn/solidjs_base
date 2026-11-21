import assert from 'node:assert/strict'
import { it } from 'node:test'

import manifest from '../package.json' with { type: 'json' }
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

const tokens = (text: string) =>
  text
    .match(
      /--[\w{}-]+|git init|\{pm\} install|bunx @evertondgn\/create-solid@latest/gu
    )
    ?.toSorted() ?? []
void it('mentions the same flags and commands in each translation', () => {
  for (const catalog of Object.values(messages)) {
    const translations = new Map(Object.entries(catalog))
    for (const [key, value] of Object.entries(messages.en)) {
      assert.deepEqual(tokens(translations.get(key) ?? ''), tokens(value), key)
    }
  }
})

void it('introduces the included Solid 2 tooling in every language', () => {
  assert.equal(manifest.description, messages.en.tagline)
  assert.equal(
    messages.en.tagline,
    'Start a Solid 2 application with Vite+, TypeScript and tests set up.'
  )
  assert.equal(
    messages['pt-BR'].tagline,
    'Comece uma aplicação Solid 2 com Vite+, TypeScript e testes prontos.'
  )
  assert.equal(
    messages.es.tagline,
    'Empieza una aplicación Solid 2 con Vite+, TypeScript y pruebas listas.'
  )
})

void it('fits focused options with their hints in 80 columns', () => {
  for (const m of Object.values(messages)) {
    for (const [label, hint] of [
      [m.fonts, m.fontHint],
      [m.server, m.serverHint],
      [m.static, m.staticHint],
      [m.client, m.clientHint],
      [`pnpm · ${m.unavailable}`, m.installHint],
      [`bun · ${m.unavailable}`, m.bunHint]
    ] as const) {
      assert.doesNotMatch(hint, /[()]|\.$/u)
      const terminalWidth = 80
      assert.ok(`│  ● ${label} (${hint})`.length <= terminalWidth)
    }
  }
})
