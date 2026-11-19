import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import type { StagedContext } from '../types.ts'
import { readLocaleSettings } from './catalogs.ts'

export function configureSingleLocaleTests({
  stage,
  write
}: StagedContext): string[] {
  if (readLocaleSettings(stage).locales.length !== 1) return []
  const changed: string[] = []
  const files = readdirSync(path.join(stage, 'src'), {
    recursive: true,
    withFileTypes: true
  })
  for (const entry of files) {
    if (!entry.isFile() || !/\.tsx?$/u.test(entry.name)) continue
    const absolute = path.join(entry.parentPath, entry.name)
    const file = path.relative(stage, absolute)
    if (!file.includes('/tests/') && !file.includes('/__tests__/')) continue
    const source = readFileSync(absolute, 'utf8')
    let text = source.replace(
      /const alternate =\s*locales\.find\(locale => locale !== baseLocale\) \?\? baseLocale/u,
      'const alternate = baseLocale'
    )
    text = text.replace("alternate === baseLocale ? '' : '_self'", "''")
    if (text === source) continue
    const runtime = /import \{[^{}]*\} from '@paraglide\/runtime\.js'/u
    if (!/\blocales\b/u.test(text.replace(runtime, ''))) {
      text = text.replace(runtime, value => value.replace(/,\s*locales\b/u, ''))
    }
    write({ file, content: text })
    changed.push(absolute)
  }
  return changed
}
