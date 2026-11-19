import { mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'

import type { StagedContext } from '../types.ts'

export function configureBrowserPaths({
  stage,
  write
}: StagedContext): string[] {
  const helper = 'src/tests/helpers/scenarioLocales/index.ts'
  mkdirSync(path.dirname(path.join(stage, helper)), { recursive: true })
  write({
    file: helper,
    content: `import { baseLocale, locales } from '@paraglide/runtime.js'

const base = baseLocale
const alternate = locales.find(locale => locale !== base) ?? base
const third = locales.find(locale => locale !== base && locale !== alternate) ?? alternate

export const testLanguages = { alternate, base, locales, third }
`
  })
  return [
    path.join(stage, helper),
    ...readdirSync(path.join(stage, 'src/tests/pages'), {
      recursive: true,
      withFileTypes: true
    })
      .filter(entry => entry.isFile() && entry.name.endsWith('.e2e.test.ts'))
      .map(entry => path.join(entry.parentPath, entry.name))
  ]
}
