import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { editTemplate } from '../edit-template.ts'
import type { StagedContext } from '../types.ts'
import { readLocaleSettings } from './catalogs.ts'

export function configureSingleLocaleTests({
  stage,
  profile,
  write
}: StagedContext): string[] {
  const changed: string[] = []
  const helper = 'src/tests/helpers/testLanguages/index.ts'
  const edit =
    (file: string) => (pattern: RegExp | string, replacement: string) => {
      const target = path.join(stage, file)
      const text = readFileSync(target, 'utf8')
      write({
        file,
        content: editTemplate({
          file,
          text,
          pattern,
          replacement,
          expectedMatches: 1
        })
      })
      if (!changed.includes(target)) changed.push(target)
    }
  if (profile.mode === 'client' || profile.mode === 'static') {
    edit(helper)(/^import \{ m \}[^\n]+\n/gmu, '')
    edit(helper)(/^import \{ LOCALE_NAMES as names \}[^\n]+\n/gmu, '')
    edit(helper)(
      /^const \{ base, tag \} = routing[\s\S]*$/gmu,
      'export const testLanguages = routing\n'
    )
  }
  if (readLocaleSettings(stage).locales.length === 1) {
    edit(helper)(
      'const alternate = locales.find(locale => locale !== baseLocale) ?? baseLocale',
      'const alternate = baseLocale'
    )
    const file =
      'src/components/atoms/LocalizedLink/__tests__/LocalizedLink.dom.test.tsx'
    if (existsSync(path.join(stage, file))) {
      edit(file)("alternate === baseLocale ? '' : '_self'", "''")
    }
  }
  return changed
}
