import { createRequire } from 'node:module'
import path from 'node:path'
import { cwd } from 'node:process'

import type { UserConfig } from 'vite-plus'

import backendPolicy from './backendPolicy/index.ts'
import { environmentRules } from './lint/rules/environment.ts'
import { importRules } from './lint/rules/imports.ts'
import { javascriptRules } from './lint/rules/javascript.ts'
import { testRules } from './lint/rules/testing.ts'
import { typescriptRules } from './lint/rules/typescript.ts'
import { unicornRules } from './lint/rules/unicorn.ts'
import type { LintRules } from './lint/types.ts'

type JsPlugin = { name: string; specifier: string }

const TEST_FILES = ['**/*.test.{ts,tsx}', '**/*.test-d.{ts,tsx}', '**/tests/**']
const PARAGLIDE_PLUGIN = '@inlang/paraglide-js/eslint'

// Oxlint loads the plugins by specifier from the folder where lint runs. An
// application without Paraglide gets neither its plugin nor its rule.
function resolvesFromApplication(specifier: string): boolean {
  try {
    createRequire(path.join(cwd(), 'package.json')).resolve(specifier)
    return true
  } catch {
    return false
  }
}

const hasParaglide = resolvesFromApplication(PARAGLIDE_PLUGIN)
const paraglidePlugins: JsPlugin[] = hasParaglide
  ? [{ name: 'paraglide', specifier: PARAGLIDE_PLUGIN }]
  : []
const paraglideRules: LintRules = hasParaglide
  ? {
      'paraglide/no-dynamic-message-access': [
        'error',
        {
          messageModules: [
            '@paraglide/messages.js',
            '@paraglide/messages/_index.js'
          ]
        }
      ]
    }
  : {}

export const lint: NonNullable<UserConfig['lint']> = {
  ignorePatterns: [
    'public/**',
    'src/assets/**',
    'src/@types/routes.d.ts',
    '.agents/**',
    '.claude/**'
  ],
  categories: {
    correctness: 'off',
    nursery: 'off',
    pedantic: 'off',
    perf: 'off',
    restriction: 'off',
    style: 'off',
    suspicious: 'off'
  },
  jsPlugins: [
    {
      name: 'project',
      specifier: '@evertondgn/solid-tooling/project-plugin'
    },
    {
      name: 'backend',
      specifier: '@evertondgn/solid-tooling/backend-plugin'
    },
    {
      name: 'architecture',
      specifier: '@evertondgn/solid-tooling/architecture-plugin'
    },
    ...paraglidePlugins,
    { name: 'solid', specifier: '@evertondgn/solid-tooling/solid-plugin' },
    { name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }
  ],
  options: {
    typeAware: true,
    typeCheck: true,
    denyWarnings: true,
    reportUnusedDisableDirectives: 'error'
  },
  overrides: [
    ...backendPolicy,
    {
      files: ['src/infra/server/**/index.ts'],
      rules: {
        'import/no-unassigned-import': ['error', { allow: ['server-only'] }]
      }
    },
    {
      files: [
        'src/**/*.node.test.{ts,tsx}',
        'src/tests/pages/**/*.e2e.test.ts',
        'src/tests/helpers/readSiteOrigin/index.ts',
        'src/tests/fixtures/e2e/routes/publication-probe/metrics.ts',
        'src/infra/server/publicationScope/index.ts'
      ],
      rules: { 'import/no-nodejs-modules': 'off' }
    },
    {
      files: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.test-d.{ts,tsx}',
        'tooling/**/*.test.ts'
      ],
      rules: { 'unicorn/filename-case': 'off' }
    },
    {
      // Test callbacks and Vite plugin hooks follow third-party signatures,
      // which may need more than two parameters.
      files: [
        'src/**/*.test.{ts,tsx}',
        'src/tests/**/*.{ts,tsx}',
        'tooling/**/__tests__/**/*.ts',
        'vite.config.ts'
      ],
      rules: { 'eslint/max-params': 'off' }
    },
    {
      files: ['src/@types/icons.d.ts'],
      rules: {
        'import/unambiguous': 'off'
      }
    },
    {
      files: ['src/**/*.tsx'],
      rules: {
        'typescript/explicit-module-boundary-types': 'off'
      }
    },
    {
      files: [
        'src/@types/solid.d.ts',
        'src/@types/env.d.ts',
        'src/@types/router.d.ts'
      ],
      rules: {
        'import/no-unassigned-import': 'off',
        // These declarations extend third-party interfaces through declaration
        // merging, which only interface allows; the project's own types use type.
        'typescript/consistent-type-definitions': 'off'
      }
    },

    {
      files: TEST_FILES,
      rules: {
        'eslint/no-empty': 'off',
        'vitest/require-hook': 'error'
      }
    },
    {
      // Tooling does not use Vitest: suites and test helpers import node:test.
      files: ['tooling/**/*.ts'],
      rules: { 'vitest/no-import-node-test': 'off' }
    },
    {
      // node:test has no each, and the runner tracks the Promise that describe
      // and it return.
      files: ['tooling/**/__tests__/**/*.ts'],
      rules: {
        'typescript/no-floating-promises': [
          'error',
          {
            allowForKnownSafeCalls: [
              {
                from: 'package',
                package: 'node:test',
                name: ['describe', 'it', 'test', 'suite']
              }
            ]
          }
        ],
        'vitest/prefer-each': 'off'
      }
    },
    {
      // The Playwright runner has no test.each.
      files: ['src/tests/pages/**/*.e2e.test.ts'],
      rules: { 'vitest/prefer-each': 'off' }
    },
    {
      files: ['**/*.{ts,tsx,mts,cts}'],
      rules: {
        'eslint/no-undef': 'off'
      }
    },
    {
      files: ['vite.config.ts', 'tooling/**/*.ts'],
      rules: {
        'import/no-nodejs-modules': 'off'
      }
    },
    {
      files: ['src/App.tsx', 'src/Document.tsx'],
      rules: {
        'unicorn/filename-case': 'off'
      }
    },
    {
      files: [
        'src/tests/fixtures/e2e/middleware/index.ts',
        'src/middleware/localizeRequest/index.ts'
      ],
      rules: {
        'node/callback-return': 'off'
      }
    }
  ],
  plugins: [
    'import',
    'jsx-a11y',
    'node',
    'oxc',
    'promise',
    'typescript',
    'unicorn',
    'vitest'
  ],
  rules: {
    ...environmentRules,
    ...javascriptRules,
    ...importRules,
    ...typescriptRules,
    ...unicornRules,
    ...testRules,
    ...paraglideRules
  },
  settings: {
    'jsx-a11y': {
      attributes: {
        for: ['htmlFor', 'for']
      }
    },
    solid: { version: 2 }
  }
}
