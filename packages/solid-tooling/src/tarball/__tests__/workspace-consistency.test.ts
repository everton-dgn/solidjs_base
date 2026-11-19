import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { assertGuidePlugin } from '../no-server-scenarios.ts'
import {
  checkApplicationVersions,
  checkPackageEngines
} from '../workspace-versions.ts'

const ROOT = path.resolve(import.meta.dirname, '../../../../..')
const SCENARIOS = ['client-only', 'ssr-plain', 'ssr-i18n']

test('the no-server guide shows the plugin of the scenario', () => {
  const guide = path.join(ROOT, 'docs/tooling/no-server.md')
  assertGuidePlugin(readFileSync(guide, 'utf8'))
})
test('the applications pin the versions of the workspace', () => {
  checkApplicationVersions({ root: ROOT, scenarios: SCENARIOS })
})
test('the packages require the Node version of the workspace', () => {
  checkPackageEngines(ROOT)
})
