import { readdirSync } from 'node:fs'
import path from 'node:path'

import type { StagedContext } from '../types.ts'
import { configureTestLabels } from './browser-labels.ts'
import { readLocaleSettings } from './catalogs.ts'
import { configureSingleBrowserTests } from './single-browser-tests.ts'
import { configureSingleMenuTests } from './single-menu-tests.ts'

export function configureBrowserPaths(context: StagedContext): string[] {
  const { stage } = context
  if (readLocaleSettings(stage).locales.length === 1) {
    configureSingleBrowserTests(context)
    configureSingleMenuTests(context)
  }
  const helper = 'src/tests/helpers/scenarioLocales/index.ts'
  configureTestLabels(context)
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
