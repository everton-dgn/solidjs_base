import path from 'node:path'
import { env } from 'node:process'
import { fileURLToPath } from 'node:url'

import type { TestUserConfig, ViteUserConfig } from 'vite-plus'
import { playwright } from 'vite-plus/test/browser-playwright'

type SolidTestOptions = {
  root: string
  plugins: ViteUserConfig['plugins']
}

type ModuleStubPlugin = {
  name: string
  enforce: 'pre'
  resolveId: (id: string) => string | undefined
  load: (id: string) => string | undefined
}

const CI_WORKERS = 2
const STUB_PREFIX = '\0solid-tooling-stub:'
// Stand-ins for modules that the Solid and routing plugins provide in a real
// build, which the node project does not load. A plugin serves them because Knip
// also applies resolve.alias to production code, where a path inside this
// package would count as a dependency of the application.
const NODE_STUBS: Record<string, string> = {
  'server-only': 'export default undefined',
  'virtual:file-routes': 'export const pageRoutes = []\nexport default []',
  'virtual:solid-server-function-handler': "export const endpoint = '/_server'"
}
// Vitest writes test.env into process.env, where an absent value would become
// the string "undefined", so only the variables that exist are passed on.
const TEST_ENV_KEYS = ['BASE_URL_TEST', 'HOST', 'PORT']

function packageFile(name: string): string {
  return fileURLToPath(new URL(name, import.meta.url))
}

function nodeStubs(): ModuleStubPlugin {
  return {
    name: 'solid-tooling:node-stubs',
    enforce: 'pre',
    resolveId: id => (id in NODE_STUBS ? `${STUB_PREFIX}${id}` : undefined),
    load: id =>
      id.startsWith(STUB_PREFIX)
        ? NODE_STUBS[id.slice(STUB_PREFIX.length)]
        : undefined
  }
}

function readTestEnv(): Record<string, string> {
  return Object.fromEntries(
    TEST_ENV_KEYS.flatMap(key => {
      const value = env[key]
      return value === undefined ? [] : [[key, value]]
    })
  )
}

export function solidTest({ root, plugins }: SolidTestOptions): TestUserConfig {
  return {
    pool: 'threads',
    maxWorkers: env.CI ? CI_WORKERS : undefined,
    css: false,
    globals: true,
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    expect: { requireAssertions: true, poll: { interval: 10 } },
    env: readTestEnv(),
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/{constants,types,@types}/**',
        'src/**/{constants,types}.{ts,tsx}',
        'src/**/__tests__/**',
        'src/tests/**',
        'src/App.tsx',
        'src/Document.tsx',
        'src/entry-server.tsx',
        'src/entry-client.tsx',
        'src/router.ts'
      ]
    },
    reporters: env.GITHUB_ACTIONS ? ['default', 'github-actions'] : ['verbose'],
    // The projects inherit the options above (Vitest's default extends) and
    // declare only what changes: environment, include, plugins and aliases.
    projects: [
      {
        plugins: [nodeStubs()],
        test: {
          name: { label: 'node', color: 'cyan' },
          environment: 'node',
          include: ['src/**/*.node.test.{ts,tsx}']
        }
      },
      {
        plugins,
        test: {
          name: { label: 'dom', color: 'magenta' },
          environment: 'happy-dom',
          environmentOptions: { happyDOM: { url: 'http://localhost/en' } },
          include: ['src/**/*.dom.test.{ts,tsx}']
        }
      },
      {
        plugins,
        // WHY: the setup file lives in node_modules, where the tsconfig paths
        // of the application do not apply.
        resolve: {
          alias: [
            {
              find: /^@paraglide\//u,
              replacement: `${path.join(root, 'paraglide')}/`
            }
          ]
        },
        test: {
          css: true,
          name: { label: 'browser', color: 'yellow' },
          setupFiles: [packageFile('vitest-setup/browser.mjs')],
          include: ['src/**/*.browser.test.{ts,tsx}'],
          browser: {
            enabled: true,
            headless: true,
            trace: {
              mode: 'retain-on-failure',
              tracesDir: path.join(root, 'test-results/browser-traces')
            },
            // GitHub runners have Chrome; local runs use Playwright's Chromium.
            provider: playwright({
              contextOptions: { locale: 'en-US' },
              launchOptions: env.CI ? { channel: 'chrome' } : {}
            }),
            instances: [{ browser: 'chromium' }]
          }
        }
      }
    ]
  }
}
