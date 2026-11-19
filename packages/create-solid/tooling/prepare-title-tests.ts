import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const titleEdits = {
  headingLocator: [
    'page.getByText(SITE.title, { exact: true })',
    "page.locator('main').getByText(SITE.title, { exact: true })"
  ],
  localizedContent: [
    '  for (const { language, format, body } of results)',
    "  const { texts } = await readBodyTexts({ catalog: '(home)', message: 'home_features' })\n  for (const { language, format, body } of results)"
  ],
  otherLanguages: [
    'expect(body).not.toContain(other.title)',
    "const text = texts[LANGUAGES.indexOf(other)]\n      if (!text) throw new Error('Missing localized home text')\n      expect(body).not.toContain(text)"
  ],
  activeLanguage: [
    'expect(body).toContain(language.title)',
    "expect(body).toContain(language.title)\n    const active = texts[LANGUAGES.indexOf(language)]\n    if (!active) throw new Error('Missing localized home text')\n    expect(body).toContain(active)"
  ],
  englishHome: [`\`\${SITE.title} for web applications\``, 'SITE.title'],
  portugueseHome: [`\`\${SITE.title} para aplicações web\``, 'SITE.title'],
  spanishHome: [`\`\${SITE.title} para aplicaciones web\``, 'SITE.title'],
  englishPageTitle: [
    `\`\${SITE.title} | Web applications with SSR\``,
    'SITE.title'
  ],
  portuguesePageTitle: [
    `\`\${SITE.title} | Aplicações web com SSR\``,
    'SITE.title'
  ],
  aboutHeading: [`\`Sobre o \${SITE.title}\``, `\`Sobre \${SITE.title}\``],
  imageDescription: [
    `\`Logo do SolidJS sobre o título \${SITE.title}\``,
    "'Logo do SolidJS sobre o título SolidJS Boilerplate'"
  ]
} as const
type Source = readonly [
  string,
  readonly (readonly [keyof typeof titleEdits, number])[]
]
const twoAssertions = 2
const threeAssertions = 3
const sources: readonly Source[] = [
  [
    'AgentReadiness/AgentReadiness.content.production.e2e.test.ts',
    [
      ['englishHome', 1],
      ['portugueseHome', 1],
      ['spanishHome', 1],
      ['aboutHeading', 1]
    ]
  ],
  ['Home/Home.production.e2e.test.ts', [['portugueseHome', 1]]],
  [
    'Home/Home.seo.e2e.test.ts',
    [
      ['portuguesePageTitle', 1],
      ['imageDescription', 1]
    ]
  ],
  ['Hydration/Hydration.e2e.test.ts', [['englishHome', 1]]],
  ['Hydration/Hydration.parser.e2e.test.ts', [['englishHome', 1]]],
  ['Hydration/Hydration.preload.e2e.test.ts', [['englishHome', 1]]],
  [
    'I18n/I18n.e2e.test.ts',
    [
      ['englishHome', 1],
      ['headingLocator', 1]
    ]
  ],
  [
    'I18n/I18n.production.e2e.test.ts',
    [
      ['englishHome', twoAssertions],
      ['portugueseHome', twoAssertions],
      ['spanishHome', threeAssertions],
      ['localizedContent', 1],
      ['otherLanguages', 1],
      ['activeLanguage', 1]
    ]
  ],
  ['I18n/I18n.redirect.e2e.test.ts', [['spanishHome', 1]]],
  [
    'I18n/I18n.urlPattern.production.e2e.test.ts',
    [
      ['englishHome', 1],
      ['portugueseHome', 1]
    ]
  ],
  ['NotFound/NotFound.seo.e2e.test.ts', [['englishHome', 1]]],
  ['OutdatedPage/OutdatedPage.e2e.test.ts', [['aboutHeading', 1]]],
  ['SeoIndexes/SeoIndexes.e2e.test.ts', [['englishPageTitle', 1]]],
  [
    'StructuredData/StructuredData.streaming.e2e.test.ts',
    [['portuguesePageTitle', 1]]
  ]
]

export function prepareTitleTests(): void {
  const files = []
  for (const [name, edits] of sources) {
    const file = path.join('template/src/tests/pages', name)
    let text = readFileSync(file, 'utf8')
    for (const [key, count] of edits) {
      const [pattern, replacement] = titleEdits[key]
      const parts = text.split(pattern)
      if (parts.length !== count + 1) {
        throw new Error(`Review the title assertion in ${file}: ${pattern}`)
      }
      text = parts.join(replacement)
    }
    writeFileSync(file, text)
    files.push(file)
  }
  execFileSync(path.resolve('../../node_modules/.bin/vp'), [
    'fmt',
    '--config',
    'dist/formatter/vite.config.mjs',
    ...files
  ])
}
