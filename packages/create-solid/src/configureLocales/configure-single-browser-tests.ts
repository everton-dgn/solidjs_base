import { readFileSync } from 'node:fs'
import path from 'node:path'

import { editTemplate } from '../edit-template.ts'
import type { StagedContext } from '../types.ts'

type Edit = readonly [RegExp, string]
const cases: Record<string, Edit[]> = {
  'I18n/I18n.production': [
    [/^test\('switches language and hydrates[\s\S]*?^\}\)\n/mu, ''],
    [/^test\('switches language by keyboard[\s\S]*?^\}\)\n/mu, ''],
    [
      / {4}await page\.getByRole\('button', \{ name: language\.selector \}\)\.click\(\)\n[\s\S]*?page\.keyboard\.press\('Escape'\)\n/u,
      ''
    ]
  ],
  'I18n/I18n.hydration': [
    [/^const LOCALES = [\s\S]*?(?=^test\('keeps the SSR document)/mu, '']
  ],
  'I18n/I18n.redirect': [
    [/^for \(const source of \['action', 'query'\]\) \{[\s\S]*?^\}\n/mu, ''],
    [
      /^test\('back and forward across locale history entries[\s\S]*?^\}\)\n/mu,
      ''
    ]
  ],
  'UiKit/UiKit': [
    [
      /\)\.toBe\(false\)\n {2}await expect\(\n {4}page\.getByRole\('button', \{\s*name: testLanguages\.labels\(testLanguages\.alternate\)\.selector\s*\}\)\n {2}\)\.toBeVisible\(\)/u,
      ').toBe(true)'
    ]
  ],
  'Home/Home.production': [[/const MENU_TRIGGERS = (?<count>\d+)/u, '']]
}

export function configureSingleBrowserTests({
  stage,
  profile,
  write
}: StagedContext): void {
  for (const [name, edits] of Object.entries(cases)) {
    if (profile.hasI18n === false && name.startsWith('I18n/')) continue
    const file = `src/tests/pages/${name}.e2e.test.ts`
    let text = readFileSync(path.join(stage, file), 'utf8')
    for (const [pattern, value] of edits) {
      const replacement =
        name === 'Home/Home.production'
          ? `const MENU_TRIGGERS = ${profile.hasTheme === false ? 0 : 1}`
          : value
      text = editTemplate({ file, text, pattern, replacement })
    }
    write({ file, content: text })
  }
}
