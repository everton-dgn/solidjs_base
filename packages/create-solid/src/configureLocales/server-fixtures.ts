import { readFileSync } from 'node:fs'
import path from 'node:path'

import { editTemplate } from '../edit-template.ts'
import type { StagedContext } from '../types.ts'

const baseImport = "import { baseLocale } from '@paraglide/runtime.js'"
const localeImport =
  "import { baseLocale, locales } from '@paraglide/runtime.js'"
const alternate =
  'const alternate = locales.find(locale => locale !== baseLocale) ?? baseLocale'
type Change = readonly [string, string]

export function configureServerFixtures({
  stage,
  profile,
  write
}: StagedContext): string[] {
  const files: string[] = []
  const apply = (file: string, changes: Change[]) => {
    const absolute = path.join(stage, file)
    let text = readFileSync(absolute, 'utf8')
    for (const [pattern, replacement] of changes) {
      text = editTemplate({
        file,
        text,
        pattern,
        replacement: () => replacement
      })
    }
    write({ file, content: text })
    files.push(absolute)
  }

  apply('src/tests/setup/browser/__tests__/browser.browser.test.ts', [
    [
      'baseLocale, getLocale, setLocale',
      'baseLocale, getLocale, locales, setLocale'
    ],
    ['describe(', `${alternate}\n\ndescribe(`],
    ["setLocale('pt',", 'setLocale(alternate,'],
    ["setLocale('es',", 'setLocale(alternate,'],
    ["toBe('es')", 'toBe(alternate)']
  ])
  apply('src/tests/fixtures/e2e/routes/(base)/ui-kit/index.tsx', [
    ['import ', `${localeImport}\nimport `],
    [
      "import S from './styles.module.css'",
      `import S from './styles.module.css'\n\n${alternate}`
    ],
    ['locale="es"', 'locale={alternate}'],
    ['Spanish page', 'Alternate language page']
  ])
  apply('src/tests/pages/UiKit/UiKit.e2e.test.ts', [
    ['Spanish page', 'Alternate language page']
  ])
  apply('src/tests/fixtures/e2e/routes/(base)/i18n-redirect.tsx', [
    ['import { getLocale }', 'import { baseLocale, getLocale, locales }'],
    ['const submitRedirect', `${alternate}\n\nconst submitRedirect`],
    ["locale: 'es', source: 'query'", "locale: alternate, source: 'query'"],
    ["locale: 'es', source: 'action'", "locale: alternate, source: 'action'"],
    ["locale: 'pt', source: 'action'", "locale: baseLocale, source: 'action'"],
    [
      "'/pt/i18n-redirect?from=state#target'",
      `\`/\${baseLocale}/i18n-redirect?from=state#target\``
    ],
    ['Spanish action redirect', 'Alternate action redirect'],
    ['Portuguese action redirect', 'Base action redirect'],
    ['Spanish query redirect', 'Alternate query redirect']
  ])
  apply('src/tests/pages/I18n/I18n.redirect.e2e.test.ts', [
    [`Spanish \${source} redirect`, `Alternate \${source} redirect`],
    ['Portuguese action redirect', 'Base action redirect']
  ])
  if (profile.hasSeo !== false) {
    apply(
      'src/middleware/markdownContent/__tests__/markdownContent.abort.node.test.ts',
      [
        ['import ', `${baseImport}\nimport `],
        [
          "'https://example.com/en/about.md'",
          `\`https://example.com/\${baseLocale}/about.md\``
        ]
      ]
    )
  }
  return files
}
