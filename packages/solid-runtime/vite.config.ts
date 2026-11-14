import solid from '@solidjs/vite-plugin'
import { defineConfig, type Plugin } from 'vite-plus'

import { lint } from '../solid-tooling/src/lint.ts'
import { LOCALE_SOURCE } from './tooling/testing/locale-source.ts'

const TOOLING_SOURCE = '../solid-tooling/src'
// Repeated from the root config: each config writes the paths from its folder.
const SOURCE_PLUGINS: Record<string, string> = {
  project: `${TOOLING_SOURCE}/project-plugin.ts`,
  backend: `${TOOLING_SOURCE}/backendPolicy/plugin.ts`,
  architecture: `${TOOLING_SOURCE}/architecturePolicy/index.ts`,
  solid: `${TOOLING_SOURCE}/solid-plugin.ts`
}
const jsPlugins = (lint.jsPlugins ?? []).map(plugin =>
  typeof plugin === 'string'
    ? plugin
    : {
        name: plugin.name,
        specifier: SOURCE_PLUGINS[plugin.name] ?? plugin.specifier
      }
)

const STUB_PREFIX = '\0solid-runtime-stub:'
// The stand-ins that solidTest serves to the node project of an application:
// the Solid and routing plugins provide these modules only in a real build.
const NODE_STUBS = new Map([
  ['virtual:solid-app/locale', LOCALE_SOURCE],
  [
    'virtual:solid-app/locale-request',
    `export * from '${import.meta.dirname}/tooling/testing/generated/runtime.js'; export * from '${import.meta.dirname}/tooling/testing/generated/server.js'`
  ],
  ['server-only', 'export default undefined'],
  ['virtual:file-routes', 'export const pageRoutes = []\nexport default []'],
  [
    'virtual:solid-server-function-handler',
    "export const endpoint = '/_server'"
  ]
])

function nodeStubs(): Plugin {
  return {
    name: 'solid-runtime:node-stubs',
    enforce: 'pre',
    resolveId: id => (NODE_STUBS.has(id) ? `${STUB_PREFIX}${id}` : undefined),
    load: id =>
      id.startsWith(STUB_PREFIX)
        ? NODE_STUBS.get(id.slice(STUB_PREFIX.length))
        : undefined
  }
}

export default defineConfig({
  resolve: {
    alias: {
      '@': `${import.meta.dirname}/src`,
      '@paraglide': `${import.meta.dirname}/tooling/testing/generated`,
      '@testing': `${import.meta.dirname}/tooling/testing`
    }
  },
  // vp lint reads this block from the package folder; vp check and the
  // formatter use the root config.
  lint: {
    ...lint,
    jsPlugins,
    overrides: [
      ...(lint.overrides ?? []),
      {
        files: ['src/infra/server/publicErrors/index.ts'],
        rules: {
          'backend/restricted-imports': ['error', { allowSafeErrors: true }]
        }
      },
      {
        files: ['src/infra/server/configureServerErrors/index.ts'],
        // The package exports the configurator; application setup only calls it.
        rules: { 'backend/no-setup-exports': 'off' }
      },
      {
        files: ['src/infra/server/logServerFailure/index.ts'],
        rules: {
          'eslint/no-console': ['error', { allow: ['error'] }],
          'eslint/no-restricted-globals': [
            'error',
            {
              globals: ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'],
              checkGlobalObject: true,
              globalObjects: ['global']
            }
          ]
        }
      },
      {
        files: ['src/infra/server/publicationScope/index.ts'],
        rules: { 'import/no-nodejs-modules': 'off' }
      }
    ]
  },
  plugins: [nodeStubs()],
  test: {
    pool: 'threads',
    globals: true,
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    expect: { requireAssertions: true, poll: { interval: 10 } },
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.node.test.{ts,tsx}']
        }
      },
      {
        plugins: [solid()],
        test: {
          name: 'dom',
          environment: 'happy-dom',
          environmentOptions: { happyDOM: { url: 'http://localhost/' } },
          setupFiles: ['./tooling/testing/dom.ts'],
          include: ['src/**/*.dom.test.{ts,tsx}']
        }
      }
    ],
    // The thresholds and exclusions that solidTest gives to an application.
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/{constants,types}.{ts,tsx}',
        'src/**/__tests__/**',
        'src/tests/**'
      ]
    }
  }
})
