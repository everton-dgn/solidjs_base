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
type PrefixMap = { from: string; to: string }

const jsPlugins = (lint.jsPlugins ?? []).map(plugin =>
  typeof plugin === 'string'
    ? plugin
    : {
        name: plugin.name,
        specifier: SOURCE_PLUGINS[plugin.name] ?? plugin.specifier
      }
)

// The preset writes its overrides for the folders of an application. The
// tooling package takes the ones of the folder it stands for, in the same order.
function presetOverrides({ from, to }: PrefixMap): typeof lint.overrides {
  return (lint.overrides ?? []).flatMap(override => {
    const files = override.files
      .filter(pattern => pattern.startsWith(from))
      .map(pattern => pattern.replace(from, to))
    return files.length > 0 ? [{ ...override, files }] : []
  })
}

// The tooling sources are application tooling: they use node:test and Node
// modules.
const toolingOverrides = presetOverrides({
  from: 'tooling/',
  to: 'packages/solid-tooling/src/'
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
    ignorePatterns: [
      ...(lint.ignorePatterns ?? []),
      'fixtures/**',
      'apps/**',
      // The runtime package runs vp lint in its own folder, where the rules
      // read its src/ as the src/ of an application.
      'packages/solid-runtime/**'
    ],
    jsPlugins,
    overrides: [
      ...(lint.overrides ?? []),
      ...(toolingOverrides ?? []),
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
