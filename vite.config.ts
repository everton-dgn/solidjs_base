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
const PACKAGE_SOURCE_PREFIX = 'packages/solid-tooling/src/'
const RUNTIME_SOURCE = 'packages/solid-runtime/src'

const jsPlugins = (lint.jsPlugins ?? []).map(plugin =>
  typeof plugin === 'string'
    ? plugin
    : {
        name: plugin.name,
        specifier: SOURCE_PLUGINS[plugin.name] ?? plugin.specifier
      }
)

// The tooling sources get the exceptions the preset reserves for application
// tooling: they use node:test and Node modules. The runtime package holds
// application code and gets only the test exceptions below.
const packageOverrides = (lint.overrides ?? []).flatMap(override => {
  const files = override.files
    .filter(pattern => pattern.startsWith(APP_TOOLING_PREFIX))
    .map(pattern => pattern.replace(APP_TOOLING_PREFIX, PACKAGE_SOURCE_PREFIX))
  return files.length > 0 ? [{ ...override, files }] : []
})

export default defineConfig({
  // WHY: release-please writes CHANGELOG.md in its own format on every release,
  // and the publish job validates the workspace after that. The applications
  // in apps/ are checked by their own configuration.
  fmt: {
    ...fmt,
    ignorePatterns: [
      ...(fmt.ignorePatterns ?? []),
      '**/CHANGELOG.md',
      'apps/**'
    ]
  },
  lint: {
    ...lint,
    ignorePatterns: [...(lint.ignorePatterns ?? []), 'fixtures/**', 'apps/**'],
    jsPlugins,
    overrides: [
      ...(lint.overrides ?? []),
      ...packageOverrides,
      {
        files: [`${RUNTIME_SOURCE}/**/*.test.ts`],
        rules: {
          // A test file takes the camelCase name of the module it tests.
          'unicorn/filename-case': 'off',
          // Vitest callbacks, such as test.each, may take more than two parameters.
          'eslint/max-params': 'off'
        }
      },
      {
        files: [`${RUNTIME_SOURCE}/**/*.node.test.ts`],
        // Node tests load real server adapters, such as the srvx one of Nitro.
        rules: { 'import/no-nodejs-modules': 'off' }
      },
      {
        // An ambient module declaration only works in a script file; an import
        // would turn it into an augmentation of a module that is missing here.
        files: [
          'packages/solid-tooling/src/vitest/setup/paraglide-runtime.d.ts'
        ],
        rules: { 'import/unambiguous': 'off' }
      }
    ]
  }
})
