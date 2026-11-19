import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { editTemplate } from '../src/edit-template.ts'
import type { FileEdits } from './profile-edits.ts'

const useBase = "import { baseLocale } from '@paraglide/runtime.js'\n"
const useLocales =
  "import { baseLocale, locales } from '@paraglide/runtime.js'\n"
const alternate =
  'const alternate = locales.find(locale => locale !== baseLocale) ?? baseLocale\n\n'
const navigation =
  'primitives/createOutdatedPageGuard/__tests__/createOutdatedPageGuard'
const files: FileEdits = {
  'infra/server/configureServerErrors/__tests__/configureServerErrors.messages.node.test.ts':
    [
      [
        /import \{\n {2}getLocale,/u,
        "import { m } from '@paraglide/messages.js'\nimport {\n  baseLocale,\n  locales,\n  getLocale,"
      ],
      [
        /const MESSAGES = \{[\s\S]*?const LOCALES:[^\n]+/u,
        'const message = (locale: Locale) => m.configureServerErrors_message({}, {locale})'
      ],
      [/new Error\(MESSAGES.en\)/u, 'new Error(message(baseLocale))'],
      [/toBe\(MESSAGES.en\)/u, "toBe('The request could not be completed.')"]
    ],
  'components/atoms/LocalizedLink/__tests__/LocalizedLink.dom.test.tsx': [
    [/import \{ getLocale \}/u, 'import { baseLocale, getLocale, locales }'],
    [/describe\(/u, `${alternate}describe(`],
    [/locale="pt"/u, 'locale={alternate}'],
    [/locale="es"/u, 'locale={alternate}'],
    [/toBe\('_self'\)/u, "toBe(alternate === baseLocale ? '' : '_self')"]
  ],
  'components/molecules/SiteContent/__tests__/SiteContent.dom.test.tsx': [
    [/^import/u, `${useBase}import`]
  ],
  'components/organisms/ErrorFallback/__tests__/ErrorFallback.dom.test.tsx': [
    [/^import/u, `${useBase}import`]
  ],
  [`${navigation}.dom.test.tsx`]: [
    [/^import/u, `${useLocales}import`],
    [/describe\(/u, `${alternate}describe(`]
  ],
  [`${navigation}.initial.dom.test.tsx`]: [[/^import/u, `${useBase}import`]],
  'middleware/markdownContent/__tests__/markdownContent.protocol.node.test.ts':
    [
      [/^import/u, `${useLocales}import`],
      [/type RequestOptions/u, `${alternate}type RequestOptions`],
      [/'accept-language': 'es'/u, "'accept-language': alternate"],
      [/'content-language': 'es'/u, "'content-language': alternate"]
    ],
  'routes/(seo)/llms.txt/__tests__/llms.txt.node.test.ts': [
    [/baseLocale, getLocale/u, 'baseLocale, getLocale, locales'],
    [/const BASE_DESCRIPTION/u, `${alternate}const BASE_DESCRIPTION`],
    [/locale: 'en'/u, 'locale: baseLocale'],
    [/locale: 'pt'/u, 'locale: alternate'],
    [
      /expect\(getLocale\(\)\).toBe\('pt'\)/u,
      'expect(getLocale()).toBe(alternate)'
    ],
    [
      /'https:\/\/example.com\/pt\/'/u,
      `\`https://example.com/\${alternate}/\``
    ],
    [/\/\/ Context of a request[^\n]+\n/u, ''],
    [/a Portuguese context/u, 'a localized request context'],
    [
      /expect\(base\).not.toContain\(PORTUGUESE_DESCRIPTION\)/u,
      'expect(base.includes(alternateDescription)).toBe(alternateDescription === BASE_DESCRIPTION)'
    ]
  ]
}

function prepareBrowserCatalogs(): string[] {
  const paths = []
  for (const [name, folder, keys] of [
    [
      'I18n.e2e.test.ts',
      'components/organisms/ErrorFallback',
      [
        'errorFallback_runtimeTitle',
        'errorFallback_runtimeDescription',
        'errorFallback_runtimePageTitle'
      ]
    ],
    [
      'I18n.seo.production.e2e.test.ts',
      'constants/site',
      ['site_description', 'site_imageAlt']
    ]
  ] as const) {
    const file = path.join('template/src/tests/pages/I18n', name)
    let text = readFileSync(file, 'utf8')
    const seo = folder === 'constants/site'
    text = editTemplate({
      file,
      text,
      pattern:
        /import english[^\n]+\nimport spanish[^\n]+\nimport portuguese[^\n]+\n/u,
      replacement: `import { readFile } from 'node:fs/promises'
import { array, object, parse, string } from 'valibot'
${seo ? "import { LOCALE_TAG_OVERRIDES } from '@/i18n/localeTagOverrides/index.ts'" : ''}
`
    })
    text = editTemplate({
      file,
      text,
      pattern: /const LANGUAGES = \[[\s\S]*?\n\]/u,
      replacement: `const settingsSchema = object({baseLocale: string(), locales: array(string())})
const settings = parse(settingsSchema, JSON.parse(await readFile('project.inlang/settings.json', 'utf8')))
const schema = object({${keys.map(key => `${key}: string()`).join(', ')}})
${seo ? 'const tags: Readonly<Record<string,string>> = LOCALE_TAG_OVERRIDES' : ''}
const LANGUAGES = await Promise.all(settings.locales.map(async locale => {
  const source = await readFile(\`src/${folder}/i18n/\${locale}.json\`, 'utf8')
  return { locale, ${seo ? 'tag: tags[locale] ?? locale,' : ''} messages: parse(schema, JSON.parse(source)) }
}))`
    })
    if (seo) {
      text = editTemplate({
        file,
        text,
        pattern: /readSiteOrigin\(\)\}\/en`/u,
        replacement: `readSiteOrigin()}/\${settings.baseLocale}\``
      })
    }
    writeFileSync(file, text)
    paths.push(file)
  }
  return paths
}

export function prepareLocaleTests(): void {
  const paths = prepareBrowserCatalogs()
  for (const [name, edits] of Object.entries(files)) {
    const file = path.join('template/src', name)
    let text = readFileSync(file, 'utf8')
    for (const [pattern, replacement] of edits) {
      text = editTemplate({ file, text, pattern, replacement })
    }
    text = text
      .replaceAll('it.each(LOCALES)', 'it.each(locales)')
      .replaceAll('MESSAGES[locale]', 'message(locale)')
      .replaceAll('PORTUGUESE_DESCRIPTION', 'alternateDescription')
      .replaceAll('inPortuguese', 'inLocaleContext')
      .replaceAll(/'\/(?:en|es|pt)(?:[^']*)'/gu, match => {
        const variable = match.startsWith("'/en") ? 'baseLocale' : 'alternate'
        return `\`/\${${variable}}${match.slice("'/en".length, -1)}\``
      })
      .replaceAll('origin}/en/', `origin}/\${baseLocale}/`)
      .replaceAll('ORIGIN}/es', `ORIGIN}/\${alternate}`)
    paths.push(file)
    writeFileSync(file, text)
  }
  execFileSync(path.resolve('../../node_modules/.bin/vp'), [
    'fmt',
    '--config',
    'dist/formatter/vite.config.mjs',
    ...paths
  ])
}
