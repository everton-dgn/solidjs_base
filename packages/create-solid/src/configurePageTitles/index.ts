import { readFileSync } from 'node:fs'
import path from 'node:path'

import { parse, record, string } from 'valibot'

import {
  catalogLanguage,
  readLocaleSettings
} from '../configureLocales/catalogs.ts'
import { editTemplate } from '../edit-template.ts'
import { escapeMessageText } from '../escape-message-text.ts'
import type { StagedContext } from '../types.ts'

const indent = 2
const titles = [
  ['routes/(base)/about', 'about_title', 'about_pageTitle'],
  ['routes/(base)/contact', 'contact_title', 'contact_pageTitle'],
  ['routes/(base)/privacy', 'privacy_title', 'privacy_pageTitle'],
  ['routes/(base)/[...404]', 'notFound_title', 'notFound_title'],
  [
    'components/organisms/ErrorFallback',
    'errorFallback_runtimeTitle',
    'errorFallback_runtimePageTitle'
  ]
] as const

type TitleOptions = { context: StagedContext; title: string }
type TitleEdit = { file: string; change: readonly [string, string] }
export function configurePageTitles({ context, title }: TitleOptions): void {
  const { profile, stage, write } = context
  const edit = ({ file, change: [pattern, replacement] }: TitleEdit) => {
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
    for (const locale of readLocaleSettings(stage).locales) {
      const file = `src/${folder}/i18n/${locale}.json`
      const input = readFileSync(path.join(stage, file), 'utf8')
      const data = parse(record(string(), string()), JSON.parse(input))
      const message = data[original]
      if (!message) throw new Error(`Missing page title: ${file} ${original}`)
      const aboutLabels: Record<string, string> = {
        en: 'About',
        es: 'Acerca de',
        pt: 'Sobre'
      }
      const label =
        original === 'about_title'
          ? (aboutLabels[catalogLanguage(locale)] ?? aboutLabels.en)
          : message
      data[key] = `${label} | ${escapeMessageText(title)}`
      write({ file, content: `${JSON.stringify(data, null, indent)}\n` })
    }
    if (!['about_title', 'contact_title', 'privacy_title'].includes(original)) {
      continue
    }
    if (profile.hasSeo === false) {
      edit({
        file: `src/${folder}/index.tsx`,
        change: [`children: m.${original}()`, `children: m.${key}()`]
      })
    } else {
      edit({
        file: `src/${folder}/seo.ts`,
        change: [`title: m.${original}`, `title: m.${key}`]
      })
    }
  }
  const error = 'src/components/organisms/ErrorFallback/index.tsx'
  edit({
    file: error,
    change: [
      'import { httpStatus, useHead }',
      "import { m } from '@paraglide/messages.js'\nimport { httpStatus, useHead }"
    ]
  })
  edit({
    file: error,
    change: [
      '  useHead(() =>',
      '  const pageTitle = m.errorFallback_runtimePageTitle\n  useHead(() =>'
    ]
  })
  edit({
    file: error,
    change: ['children: content().title', 'children: pageTitle()']
  })
  if (profile.hasSeo !== false) {
    edit({
      file: 'src/components/organisms/ErrorFallback/__tests__/ErrorFallback.dom.test.tsx',
      change: [
        'expect(document.title).toBe(m.errorFallback_runtimeTitle())',
        'expect(document.title).toBe(m.errorFallback_runtimePageTitle())'
      ]
    })
  }
}
