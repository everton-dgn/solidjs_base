import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { editTemplate } from '../edit-template.ts'
import type { LocaleSettings } from '../types.ts'
import {
  catalogFolders,
  catalogLanguage,
  readLocaleSettings
} from './catalogs.ts'

type CatalogSelection = { stage: string; settings: LocaleSettings }
const lineWidth = 80
function localeArray(locales: string[]): string {
  const tags = locales.map(tag => JSON.stringify(tag))
  const inline = `[${tags.join(', ')}]`
  if (inline.length + '  "locales": ,'.length <= lineWidth) return inline
  return `[\n    ${tags.join(',\n    ')}\n  ]`
}

export function configureLocales({ stage, settings }: CatalogSelection): void {
  const original = readLocaleSettings(stage)
  const { locales, baseLocale } = settings
  if (
    original.baseLocale === baseLocale &&
    JSON.stringify(locales) === JSON.stringify(original.locales)
  ) {
    return
  }
  const file = 'project.inlang/settings.json'
  const input = readFileSync(path.join(stage, file), 'utf8')
  const text = editTemplate({
    file,
    text: input,
    pattern: /"baseLocale": "[^"]+"/u,
    replacement: `"baseLocale": "${baseLocale}"`
  })
  const updated = editTemplate({
    file,
    text,
    pattern: /"locales": \[[^\]]*\]/u,
    replacement: `"locales": ${localeArray(locales)}`
  })
  writeFileSync(path.join(stage, file), updated)
  for (const folder of catalogFolders(stage)) {
    for (const tag of locales) {
      if (original.locales.includes(tag)) continue
      const seed = path.join(folder, `${catalogLanguage(tag)}.json`)
      writeFileSync(path.join(folder, `${tag}.json`), readFileSync(seed))
    }
    for (const tag of original.locales) {
      if (!locales.includes(tag)) unlinkSync(path.join(folder, `${tag}.json`))
    }
  }
}
