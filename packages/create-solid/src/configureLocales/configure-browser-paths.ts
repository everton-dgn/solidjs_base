import { readdirSync } from 'node:fs'
import path from 'node:path'

import type { StagedContext } from '../types.ts'
import { readLocaleSettings } from './catalogs.ts'
import { configureSingleBrowserTests } from './configure-single-browser-tests.ts'
import { configureSingleMenuTests } from './configure-single-menu-tests.ts'
import { configureTestLabels } from './configure-test-labels.ts'

export function configureBrowserPaths(context: StagedContext): string[] {
  const { stage } = context
  if (readLocaleSettings(stage).locales.length === 1) {
    configureSingleBrowserTests(context)
    configureSingleMenuTests(context)
  }
  const helper = 'src/tests/helpers/testLanguages/index.ts'
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
