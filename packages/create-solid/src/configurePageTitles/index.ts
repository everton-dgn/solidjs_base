import { readFileSync } from 'node:fs'
import path from 'node:path'

import { parse, record, string } from 'valibot'

import { editTemplate } from '../edit-template.ts'
import type { StagedContext } from '../types.ts'

const indent = 2
const titles = [
  ['routes/(base)/contact', 'contact_title', 'contact_pageTitle'],
  ['routes/(base)/privacy', 'privacy_title', 'privacy_pageTitle'],
  ['routes/(base)/[...404]', 'notFound_title', 'notFound_title'],
  [
    'components/organisms/ErrorFallback',
    'errorFallback_runtimeTitle',
    'errorFallback_runtimePageTitle'
  ]
] as const

export function configurePageTitles(
  context: StagedContext,
  title: string
): void {
  const { profile, stage, write } = context
  const edit = (
    file: string,
    [pattern, replacement]: readonly [string, string]
  ) => {
    const text = readFileSync(path.join(stage, file), 'utf8')
    write({
      file,
      content: editTemplate({
        file,
        text,
        pattern,
        replacement: () => replacement
      })
    })
  }
  for (const [folder, original, key] of titles) {
    for (const locale of ['en', 'es', 'pt']) {
      const file = `src/${folder}/i18n/${locale}.json`
      const input = readFileSync(path.join(stage, file), 'utf8')
      const data = parse(record(string(), string()), JSON.parse(input))
      const message = data[original]
      if (!message) throw new Error(`Missing page title: ${file} ${original}`)
      data[key] = `${message} | ${title}`
      write({ file, content: `${JSON.stringify(data, null, indent)}\n` })
    }
    if (!['contact_title', 'privacy_title'].includes(original)) continue
    if (profile.hasSeo === false) {
      edit(`src/${folder}/index.tsx`, [
        `children: m.${original}()`,
        `children: m.${key}()`
      ])
    } else {
      edit(`src/${folder}/seo.ts`, [`title: m.${original}`, `title: m.${key}`])
    }
  }
  const error = 'src/components/organisms/ErrorFallback/index.tsx'
  edit(error, [
    'import { httpStatus, useHead }',
    "import { m } from '@paraglide/messages.js'\nimport { httpStatus, useHead }"
  ])
  edit(error, [
    '  useHead(() =>',
    '  const pageTitle = m.errorFallback_runtimePageTitle\n  useHead(() =>'
  ])
  edit(error, ['children: content().title', 'children: pageTitle()'])
  if (profile.hasSeo !== false) {
    edit(
      'src/components/organisms/ErrorFallback/__tests__/ErrorFallback.dom.test.tsx',
      [
        'expect(document.title).toBe(m.errorFallback_runtimeTitle())',
        'expect(document.title).toBe(m.errorFallback_runtimePageTitle())'
      ]
    )
  }
  if ((profile.mode ?? 'server') !== 'server') return
  edit('src/tests/pages/I18n/I18n.e2e.test.ts', [
    'toHaveTitle(messages.errorFallback_runtimeTitle)',
    'toHaveTitle(messages.errorFallback_runtimePageTitle)'
  ])
  edit('src/tests/pages/I18n/I18n.production.e2e.test.ts', [
    'toHaveTitle(language.missing)',
    `toHaveTitle(\`\${language.missing} | \${SITE.title}\`)`
  ])
  for (const file of [
    'Home/Home.production.e2e.test.ts',
    'I18n/I18n.urlPattern.production.e2e.test.ts',
    ...(profile.hasSeo === false
      ? []
      : ['Home/Home.seo.e2e.test.ts', 'NotFound/NotFound.seo.e2e.test.ts'])
  ]) {
    const missing = file.startsWith('NotFound')
      ? 'Page not found'
      : 'Página não encontrada'
    edit(`src/tests/pages/${file}`, [
      `toHaveTitle('${missing}')`,
      `toHaveTitle(\`${missing} | \${SITE.title}\`)`
    ])
  }
}
