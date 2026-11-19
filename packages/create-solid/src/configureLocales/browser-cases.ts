import { readFileSync } from 'node:fs'
import path from 'node:path'

import { editTemplate } from '../edit-template.ts'
import type { StagedContext } from '../types.ts'
import { configureNegotiationTests } from './negotiation-tests.ts'

const importLine =
  "import { testLanguages } from '@/tests/helpers/scenarioLocales/index.ts'"
const lists = [
  [
    'I18n/I18n.production',
    'LANGUAGES',
    'testLanguages.locales.map(locale => testLanguages.labels(locale))'
  ],
  [
    'I18n/I18n.hydration',
    'LOCALES',
    'testLanguages.locales.filter(locale => testLanguages.other(locale) !== locale).map(locale => testLanguages.labels(locale))'
  ],
  [
    'UiKit/UiKit',
    'LANGUAGES',
    'testLanguages.locales.map(locale => testLanguages.labels(locale))'
  ]
] as const
const seoLists = [
  [
    'AgentReadiness/AgentReadiness.content.production',
    'LANGUAGES',
    'testLanguages.locales.map(locale => testLanguages.labels(locale))'
  ],
  [
    'AgentReadiness/AgentReadiness.http.production',
    'LOCALES',
    'testLanguages.locales.map(locale => ({ ...testLanguages.labels(locale), missing: testLanguages.labels(locale).missingHeading }))'
  ],
  [
    'AgentReadiness/AgentReadiness.build.production',
    'LOCALES',
    'testLanguages.locales'
  ],
  ['Markdown/Markdown', 'LOCALES', 'testLanguages.locales'],
  ['SeoIndexes/SeoIndexes.production', 'LOCALES', 'testLanguages.locales']
] as const

export function configureBrowserCases({
  stage,
  profile,
  write
}: StagedContext): void {
  const cases = profile.hasSeo === false ? lists : [...lists, ...seoLists]
  for (const [name, key, value] of cases) {
    const file = `src/tests/pages/${name}.e2e.test.ts`
    const source = readFileSync(path.join(stage, file), 'utf8')
    const pattern = source.includes(`const ${key} = [\n`)
      ? /const (?:LOCALES|LANGUAGES) = \[\n[\s\S]*?\n\]/u
      : /const LOCALES = \['pt', 'en', 'es'\]/u
    let text = editTemplate({
      file,
      text: source,
      pattern,
      replacement: `const ${key} = ${value}`
    })
    if (!text.includes('SITE.title')) {
      text = text.replace(/^import \{ SITE \}[^\n]+\n/mu, '')
    }
    if (name === 'I18n/I18n.production') {
      text = configureNegotiationTests(file, text)
      text = editTemplate({
        file,
        text,
        pattern:
          /toHaveTitle\(`\$\{language\.missing\} \| \$\{SITE\.title\}`\)/u,
        replacement: 'toHaveTitle(language.missing)'
      })
      if (profile.hasSeo !== false) {
        text = editTemplate({
          file,
          text,
          pattern: 'const ALTERNATE_LINKS = 4',
          replacement:
            'const ALTERNATE_LINKS = testLanguages.locales.length + 1'
        })
        text = editTemplate({
          file,
          text,
          pattern: 'expect(body).not.toContain(text)',
          replacement: 'if (text !== active) expect(body).not.toContain(text)'
        })
      }
    }
    write({ file, content: `${importLine}\n${text}` })
  }
}
