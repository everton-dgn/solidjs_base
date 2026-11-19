import { mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'

import type { StagedContext } from '../types.ts'
import { configureBrowserCases } from './browser-cases.ts'
import { browserLocaleLabels } from './browser-labels.ts'
import { readLocaleSettings } from './catalogs.ts'
import { configureSeoBrowserTests } from './seo-browser-tests.ts'
import { configureSingleBrowserTests } from './single-browser-tests.ts'
import { configureSingleMenuTests } from './single-menu-tests.ts'

export function configureBrowserPaths(context: StagedContext): string[] {
  const { stage, write } = context
  configureBrowserCases(context)
  if (context.profile.hasSeo !== false) configureSeoBrowserTests(context)
  if (readLocaleSettings(stage).locales.length === 1) {
    configureSingleBrowserTests(context)
    configureSingleMenuTests(context)
  }
  const helper = 'src/tests/helpers/scenarioLocales/index.ts'
  mkdirSync(path.dirname(path.join(stage, helper)), { recursive: true })
  write({
    file: helper,
    content: browserLocaleLabels(context)
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
