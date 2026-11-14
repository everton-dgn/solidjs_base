import path from 'node:path'
import { env, loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'

import {
  defineConfig,
  devices,
  type PlaywrightTestConfig
} from '@playwright/test'
import { loadEnv } from 'vite-plus'

import { TEST_LOCALE } from '../test-locale.ts'

type FixtureServer = { command: string; url: string }

type SerialSuites = {
  serverLogs?: string
  markdown?: string
  publicationLoad?: string
}

type PlaywrightOptions = {
  root: string
  testDir?: string
  fixtureServers?: FixtureServer[]
  suites?: SerialSuites
  locale?: string
}

type RunMode = {
  isProduction: boolean
  isPublicationLoad: boolean
  shouldBuild: boolean
}

type Project = NonNullable<PlaywrightTestConfig['projects']>[number]

type ProjectsInput = { mode: RunMode; suites: SerialSuites }

type ServersInput = {
  root: string
  mode: RunMode
  fixtureServers: FixtureServer[]
  baseUrl: string
  serverLog: string
}

const STARTUP_TIMEOUT = 120_000
const SECONDARY_PORT_OFFSET = 2
const MAX_PORT = 65_535
const CI_WORKERS = 2
const SECONDARY_LOG = 'test-results/server-publication-secondary.log'
// Only the e2e build keeps the Vite manifest in the static output. Without the
// guard, TEST_PREBUILT would serve the fixture routes to the production suite.
const PREBUILT_GUARD =
  "if [ -e .vercel/output/static/.vite ]; then echo 'TEST_PREBUILT found an e2e build; run vp run build first' >&2; exit 1; fi && "

function readRunMode(suites: SerialSuites): RunMode {
  const mode = {
    isProduction: env.TEST_PRODUCTION_ROUTES === 'true',
    isPublicationLoad: env.TEST_PUBLICATION_LOAD === 'true',
    shouldBuild: env.TEST_PREBUILT !== 'true'
  }
  if (mode.isPublicationLoad && mode.isProduction) {
    throw new Error('TEST_PUBLICATION_LOAD requires fixture routes')
  }
  if (mode.isPublicationLoad && !suites.publicationLoad) {
    throw new Error('TEST_PUBLICATION_LOAD requires a publicationLoad suite')
  }
  if (!mode.shouldBuild && !mode.isProduction) {
    throw new Error('TEST_PREBUILT requires production routes')
  }
  return mode
}

// The tests join paths to baseURL as text, so the value keeps the exact form
// of .env.test: a trailing slash added by URL would double the slash.
function readBaseUrl(mode: RunMode): string {
  if (!env.BASE_URL_TEST) {
    throw new Error('.env.test must define BASE_URL_TEST')
  }
  const baseUrl = new URL(env.BASE_URL_TEST)
  if (!baseUrl.port) {
    throw new Error('BASE_URL_TEST must include an explicit port')
  }
  if (
    mode.isPublicationLoad &&
    Number(baseUrl.port) + SECONDARY_PORT_OFFSET > MAX_PORT
  ) {
    throw new Error('BASE_URL_TEST leaves no port for the secondary server')
  }
  return env.BASE_URL_TEST
}

function readWorkers(mode: RunMode): number | undefined {
  if (mode.isPublicationLoad) return 1
  return env.CI ? CI_WORKERS : undefined
}

function secondaryUrl(baseUrl: string): URL {
  const url = new URL(baseUrl)
  url.port = String(Number(url.port) + SECONDARY_PORT_OFFSET)
  return url
}

function buildProjects({ mode, suites }: ProjectsInput): Project[] {
  if (mode.isPublicationLoad) {
    return [{ name: 'publication-load', testMatch: suites.publicationLoad }]
  }
  if (mode.isProduction) return [{ name: 'chromium' }]
  // The suite that counts fixed lines of the server log runs as the teardown
  // of the others, in order and alone, so each count is exact. The teardown
  // runs even when a test of the other projects fails.
  const teardown = suites.serverLogs ? { teardown: 'server-logs' } : {}
  const serial = [suites.serverLogs, suites.publicationLoad, suites.markdown]
  const projects: Project[] = [
    {
      name: 'chromium',
      testIgnore: [
        '**/*.production.e2e.test.ts',
        ...serial.filter(suite => suite !== undefined)
      ],
      ...teardown
    }
  ]
  if (suites.markdown) {
    projects.push({
      name: 'markdown',
      testMatch: suites.markdown,
      fullyParallel: false,
      workers: 1,
      ...teardown
    })
  }
  if (suites.serverLogs) {
    projects.push({
      name: 'server-logs',
      testMatch: suites.serverLogs,
      fullyParallel: false
    })
  }
  return projects
}

function buildServers({
  root,
  mode,
  fixtureServers,
  baseUrl,
  serverLog
}: ServersInput): NonNullable<PlaywrightTestConfig['webServer']> {
  const buildMode = mode.isProduction ? 'production' : 'e2e'
  const build = mode.shouldBuild
    ? `vp run build --mode ${buildMode} && `
    : PREBUILT_GUARD
  const shared = { cwd: root, reuseExistingServer: false }
  // The fixture servers start without a build, within Playwright's default
  // timeout; only the preview waits for the build.
  const server = { ...shared, timeout: STARTUP_TIMEOUT }
  const fixtures = mode.isProduction
    ? []
    : fixtureServers.map(fixture => ({ ...fixture, ...shared }))
  const { hostname, port } = new URL(baseUrl)
  const secondary = secondaryUrl(baseUrl)
  return [
    ...fixtures,
    {
      ...server,
      command: `${build}mkdir -p test-results && vp run start --strictPort > ${serverLog} 2>&1`,
      env: {
        HOST: hostname,
        PORT: port,
        NODE_ENV: 'production'
      },
      url: baseUrl
    },
    ...(mode.isPublicationLoad
      ? [
          {
            ...server,
            command: `vp run start --strictPort > ${SECONDARY_LOG} 2>&1`,
            env: {
              HOST: hostname,
              PORT: secondary.port,
              NODE_ENV: 'production'
            },
            url: secondary.href
          }
        ]
      : [])
  ]
}

export function definePlaywrightConfig({
  root,
  testDir = 'src/tests/pages',
  fixtureServers = [],
  suites = {},
  locale = TEST_LOCALE
}: PlaywrightOptions): PlaywrightTestConfig {
  loadEnvFile(path.join(root, '.env.test'))
  const mode = readRunMode(suites)
  const buildMode = mode.isProduction ? 'production' : 'e2e'
  // Reading the public variables in the build mode keeps the tests and the
  // server in agreement about the public URL; variables already set win.
  Object.assign(env, loadEnv(buildMode, root, 'VITE_'))
  // BASE_URL_TEST is the only source of host and port: loadEnvFile keeps a HOST
  // or PORT already exported in the shell, which would start another address.
  const baseUrl = readBaseUrl(mode)
  // Only the preview output goes to the file. The global teardown reads it
  // after the suite and refuses private markers.
  const serverLog = `test-results/server-${buildMode}.log`
  env.SERVER_LOG_FILE = path.join(root, serverLog)
  if (mode.isPublicationLoad) {
    env.PUBLICATION_SECONDARY_URL = secondaryUrl(baseUrl).href
    env.SERVER_LOG_SECONDARY = path.join(root, SECONDARY_LOG)
  }
  const reportFolder = mode.isProduction ? 'production' : 'e2e'
  return defineConfig({
    testDir: path.join(root, testDir),
    testMatch: mode.isProduction
      ? '**/*.production.e2e.test.ts'
      : '**/*.e2e.test.ts',
    outputDir: path.join(
      root,
      mode.isProduction ? 'test-results/e2e-production' : 'test-results/e2e'
    ),
    globalTeardown: fileURLToPath(
      new URL('playwright-teardown.mjs', import.meta.url)
    ),
    fullyParallel: !mode.isPublicationLoad,
    forbidOnly: true,
    workers: readWorkers(mode),
    reporter: [
      ['list'],
      [
        'html',
        {
          outputFolder: path.join(root, 'playwright-report', reportFolder),
          open: 'never',
          // The CI uploads the report only when the job fails.
          onlyFailures: Boolean(env.CI)
        }
      ]
    ],
    use: {
      ...devices['Desktop Chrome'],
      channel: env.CI ? 'chrome' : undefined,
      // Do not turn on bypassCSP: it disables the CSP and voids the suites
      // that check violations.
      baseURL: baseUrl,
      locale,
      screenshot: 'only-on-failure',
      trace: 'retain-on-failure'
    },
    projects: buildProjects({ mode, suites }),
    webServer: buildServers({
      root,
      mode,
      fixtureServers,
      baseUrl,
      serverLog
    })
  })
}
