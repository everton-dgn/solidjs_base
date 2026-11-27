import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { array, object, parse, string } from 'valibot'

import type { LocaleSettings } from '../types.ts'

const schema = object({ baseLocale: string(), locales: array(string()) })
export function readLocaleSettings(root: string): LocaleSettings {
  const file = path.join(root, 'project.inlang/settings.json')
  return parse(schema, JSON.parse(readFileSync(file, 'utf8')))
}

export function catalogLanguage(locale: string): 'en' | 'pt' | 'es' {
  const { language } = new Intl.Locale(locale)
  if (language === 'pt' || language === 'es') return language
  return 'en'
}

export function catalogFolders(root: string): string[] {
  const folders = new Set<string>()
  for (const entry of readdirSync(path.join(root, 'src'), {
    recursive: true,
    withFileTypes: true
  })) {
    if (
      entry.isFile() &&
      entry.name.endsWith('.json') &&
      path.basename(entry.parentPath) === 'i18n'
    ) {
      folders.add(entry.parentPath)
    }
  }
  return [...folders]
}
