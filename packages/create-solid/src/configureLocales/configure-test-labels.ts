import { readFileSync } from 'node:fs'
import path from 'node:path'

import { editTemplate } from '../edit-template.ts'
import type { StagedContext } from '../types.ts'
import { readLocaleSettings } from './catalogs.ts'

export function configureTestLabels({
  stage,
  profile,
  write
}: StagedContext): void {
  const file = 'src/tests/helpers/testLanguages/index.ts'
  const input = readFileSync(path.join(stage, file), 'utf8')
  let text = input
  const edit = (pattern: string | RegExp, replacement: string) => {
    text = editTemplate({
      file,
      text,
      pattern,
      replacement,
      expectedMatches: 1
    })
  }
  if (readLocaleSettings(stage).locales.length === 1) {
    edit(
      /const third =\s*locales\.find\(locale => locale !== base && locale !== alternate\) \?\? alternate/gu,
      'const third = alternate'
    )
    edit(
      /const other = \(locale: Locale\) =>\s*locales\.find\(candidate => candidate !== locale\) \?\? locale/gu,
      'const other = (locale: Locale) => locale'
    )
    edit(
      'const entries = [base, ...locales.filter(locale => locale !== base)]',
      'const entries = [base]'
    )
    edit(/^import \{ LOCALE_NAMES as names \}[^\n]+\n/gmu, '')
    edit('name: names[locale]', 'name: locale')
    edit(
      /const selector = m\.localeSwitcher_select\([\s\S]*?\n {2}\)/gu,
      'const selector = locale'
    )
  }
  if (profile.hasTheme === false) {
    for (const key of ['dark', 'light', 'system']) {
      edit(`m.themeToggle_${key}({}, options)`, 'locale')
    }
    edit('m.themeToggle_select({}, options)', 'selector')
  }
  if (profile.hasSeo === false) {
    edit('m.notFound_description({}, options)', "''")
    edit('m.site_description({}, options)', "''")
    edit('m.site_imageAlt({}, options)', "''")
  }
  if (text !== input) write({ file, content: text })
}
