import { defineConfig } from 'vite-plus'

import { fmt } from './packages/solid-tooling/src/fmt.ts'
import { lint } from './packages/solid-tooling/src/lint.ts'

const TOOLING_SOURCE = './packages/solid-tooling/src'
// The workspace loads its own plugins from the sources, so lint does not
// depend on the package build.
const SOURCE_PLUGINS: Record<string, string> = {
  project: `${TOOLING_SOURCE}/project-plugin.ts`,
  backend: `${TOOLING_SOURCE}/backendPolicy/plugin.ts`,
  architecture: `${TOOLING_SOURCE}/architecturePolicy/index.ts`,
  solid: `${TOOLING_SOURCE}/solid-plugin.ts`
}
const APP_TOOLING_PREFIX = 'tooling/'
const PACKAGE_SOURCE_PREFIX = 'packages/*/src/'

const jsPlugins = (lint.jsPlugins ?? []).map(plugin =>
  typeof plugin === 'string'
    ? plugin
    : {
        name: plugin.name,
        specifier: SOURCE_PLUGINS[plugin.name] ?? plugin.specifier
      }
)

// Package sources get the exceptions the preset reserves for application
// tooling: they use node:test and Node modules.
const packageOverrides = (lint.overrides ?? []).flatMap(override => {
  const files = override.files
    .filter(pattern => pattern.startsWith(APP_TOOLING_PREFIX))
    .map(pattern => pattern.replace(APP_TOOLING_PREFIX, PACKAGE_SOURCE_PREFIX))
  return files.length > 0 ? [{ ...override, files }] : []
})

export default defineConfig({
  // WHY: release-please writes CHANGELOG.md in its own format on every release,
  // and the publish job validates the workspace after that.
  fmt: {
    ...fmt,
    ignorePatterns: [...(fmt.ignorePatterns ?? []), '**/CHANGELOG.md']
  },
  lint: {
    ...lint,
    ignorePatterns: [...(lint.ignorePatterns ?? []), 'fixtures/**'],
    jsPlugins,
    overrides: [...(lint.overrides ?? []), ...packageOverrides]
  }
})
