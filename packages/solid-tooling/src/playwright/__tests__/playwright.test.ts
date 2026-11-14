import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { env, execPath } from 'node:process'
import { it, type TestContext } from 'node:test'
import { promisify } from 'node:util'

import * as v from 'valibot'

type ConfigRun = {
  root: string
  variables: Record<string, string>
  options?: Record<string, unknown>
}

type CommandRun = { command: string; directory: string; log: string }

const CONFIG = new URL('../../../dist/playwright.mjs', import.meta.url).href
const exec = promisify(execFile)
const LAST_INDEX = -1
const FIXTURE_SERVER_COUNT = 2
const LOAD_SERVER_COUNT = 3
const PREVIEW_TIMEOUT = 120_000
const SUITES = {
  serverLogs: '**/OutsideError.e2e.test.ts',
  markdown: '**/Markdown/*.e2e.test.ts',
  publicationLoad: '**/PublicationLoad.e2e.test.ts'
}
const BOILERPLATE_OPTIONS = {
  fixtureServers: [
    {
      command: 'bun tooling/testing/error-backend.ts',
      url: 'http://127.0.0.1:4318/control'
    }
  ],
  suites: SUITES
}
const FAKE_VP = '#!/bin/sh\nprintf "%s\\n" "$*" >> "$COMMAND_LOG"\n'

const patternsSchema = v.array(v.string())
const serverSchema = v.object({
  command: v.string(),
  url: v.string(),
  cwd: v.string(),
  timeout: v.optional(v.number())
})
const listReporterSchema = v.tuple([v.literal('list')])
const htmlReporterSchema = v.tuple([
  v.literal('html'),
  v.object({ outputFolder: v.string() })
])
const projectSchema = v.object({
  name: v.string(),
  testMatch: v.optional(v.string()),
  workers: v.optional(v.number()),
  fullyParallel: v.optional(v.boolean()),
  teardown: v.optional(v.string()),
  testIgnore: v.optional(patternsSchema)
})
const configSchema = v.object({
  use: v.object({ baseURL: v.string(), locale: v.string() }),
  reporter: v.tuple([listReporterSchema, htmlReporterSchema]),
  globalTeardown: v.string(),
  testDir: v.string(),
  outputDir: v.string(),
  fullyParallel: v.boolean(),
  workers: v.optional(v.number()),
  webServer: v.array(serverSchema),
  projects: v.array(projectSchema)
})

const BASE_URL = 'http://127.0.0.1:4317'

async function createRoot(context: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'playwright-root-'))
  // Sandbox created by this test: removing it directly is the right cleanup.
  context.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(path.join(root, '.env.test'), `BASE_URL_TEST=${BASE_URL}\n`)
  await writeFile(path.join(root, 'vp'), FAKE_VP, { mode: 0o755 })
  return root
}

function loadConfig({
  root,
  variables,
  options = BOILERPLATE_OPTIONS
}: ConfigRun) {
  const input = JSON.stringify({ root, ...options })
  return exec(
    execPath,
    [
      '--input-type=module',
      '--eval',
      `const { definePlaywrightConfig } = await import(${JSON.stringify(CONFIG)}); process.stdout.write(JSON.stringify(definePlaywrightConfig(${input})));`
    ],
    { env: { ...env, ...variables } }
  )
}

async function parseConfig(run: ConfigRun) {
  const { stdout } = await loadConfig(run)
  return v.parse(configSchema, JSON.parse(stdout))
}

function runCommand({ command, directory, log }: CommandRun) {
  return exec('sh', ['-c', command], {
    cwd: directory,
    env: {
      ...env,
      PATH: `${directory}${path.delimiter}${env.PATH ?? ''}`,
      COMMAND_LOG: log
    }
  })
}

it('builds local suites once and only previews an existing production build', async context => {
  const root = await createRoot(context)
  for (const options of [
    {
      production: 'false',
      prebuilt: 'false',
      expected: ['run build --mode e2e', 'run start --strictPort']
    },
    {
      production: 'true',
      prebuilt: 'false',
      expected: ['run build --mode production', 'run start --strictPort']
    },
    {
      production: 'true',
      prebuilt: 'true',
      expected: ['run start --strictPort']
    }
  ]) {
    const config = await parseConfig({
      root,
      variables: {
        TEST_PRODUCTION_ROUTES: options.production,
        TEST_PREBUILT: options.prebuilt
      }
    })
    const server = config.webServer.at(LAST_INDEX)
    assert.ok(server)
    assert.equal(server.cwd, root)
    const log = path.join(
      root,
      `commands-${options.production}-${options.prebuilt}`
    )
    await runCommand({ command: server.command, directory: root, log })
    const commands = await readFile(log, 'utf8')
    assert.deepEqual(commands.trim().split('\n'), options.expected)
  }
})

it('rejects prebuilt mode for fixture routes', async context => {
  const root = await createRoot(context)
  await assert.rejects(
    loadConfig({
      root,
      variables: { TEST_PRODUCTION_ROUTES: 'false', TEST_PREBUILT: 'true' }
    }),
    /TEST_PREBUILT requires production routes/u
  )
})

it('refuses to preview an e2e build as a prebuilt production build', async context => {
  const root = await createRoot(context)
  await mkdir(path.join(root, '.vercel/output/static/.vite'), {
    recursive: true
  })
  const config = await parseConfig({
    root,
    variables: { TEST_PRODUCTION_ROUTES: 'true', TEST_PREBUILT: 'true' }
  })
  const server = config.webServer.at(LAST_INDEX)
  assert.ok(server)
  const log = path.join(root, 'commands')
  await assert.rejects(
    runCommand({ command: server.command, directory: root, log }),
    { code: 1, stderr: /TEST_PREBUILT found an e2e build/u }
  )
  await assert.rejects(readFile(log, 'utf8'), { code: 'ENOENT' })
})

it('isolates publication saturation from normal fixtures and production routes', async context => {
  const root = await createRoot(context)
  for (const isLoadEnabled of [false, true]) {
    const config = await parseConfig({
      root,
      variables: {
        TEST_PRODUCTION_ROUTES: 'false',
        TEST_PREBUILT: 'false',
        TEST_PUBLICATION_LOAD: String(isLoadEnabled)
      }
    })
    if (isLoadEnabled) {
      assert.equal(config.webServer.length, LOAD_SERVER_COUNT)
      assert.equal(
        new Set(config.webServer.map(server => server.url)).size,
        LOAD_SERVER_COUNT
      )
      assert.ok(!config.webServer.at(LAST_INDEX)?.command.includes('build'))
      assert.equal(config.fullyParallel, false)
      assert.equal(config.workers, 1)
      assert.deepEqual(config.projects, [
        { name: 'publication-load', testMatch: SUITES.publicationLoad }
      ])
      continue
    }
    assert.equal(config.webServer.length, FIXTURE_SERVER_COUNT)
    const chromium = config.projects.find(
      project => project.name === 'chromium'
    )
    assert.ok(chromium?.testIgnore?.includes(SUITES.publicationLoad))
    assert.ok(chromium?.testIgnore?.includes(SUITES.markdown))
    const markdown = config.projects.find(
      project => project.name === 'markdown'
    )
    assert.deepEqual(markdown, {
      name: 'markdown',
      testMatch: SUITES.markdown,
      workers: 1,
      fullyParallel: false,
      teardown: 'server-logs'
    })
  }
  await assert.rejects(
    loadConfig({
      root,
      variables: {
        TEST_PRODUCTION_ROUTES: 'true',
        TEST_PREBUILT: 'false',
        TEST_PUBLICATION_LOAD: 'true'
      }
    }),
    /TEST_PUBLICATION_LOAD requires fixture routes/u
  )
})

it('runs one chromium project for an application without serial suites', async context => {
  const root = await createRoot(context)
  const variables = { TEST_PRODUCTION_ROUTES: 'false', TEST_PREBUILT: 'false' }
  const config = await parseConfig({ root, variables, options: {} })
  assert.deepEqual(config.projects, [
    { name: 'chromium', testIgnore: ['**/*.production.e2e.test.ts'] }
  ])
  assert.equal(config.webServer.length, 1)
  await assert.rejects(
    loadConfig({
      root,
      variables: { ...variables, TEST_PUBLICATION_LOAD: 'true' },
      options: {}
    }),
    /TEST_PUBLICATION_LOAD requires a publicationLoad suite/u
  )
})

it('resolves the test and output folders from the application root', async context => {
  const root = await createRoot(context)
  const config = await parseConfig({
    root,
    variables: { TEST_PRODUCTION_ROUTES: 'false', TEST_PREBUILT: 'false' }
  })
  assert.equal(config.testDir, path.join(root, 'src/tests/pages'))
  assert.equal(config.outputDir, path.join(root, 'test-results/e2e'))
})

it('keeps the base URL exactly as .env.test writes it', async context => {
  const root = await createRoot(context)
  const config = await parseConfig({
    root,
    variables: { TEST_PRODUCTION_ROUTES: 'false', TEST_PREBUILT: 'false' }
  })
  // The tests join paths to baseURL as text; a trailing slash would double it.
  assert.equal(config.use.baseURL, BASE_URL)
  assert.equal(config.webServer.at(LAST_INDEX)?.url, BASE_URL)
})

it('waits for the build only on the preview server', async context => {
  const root = await createRoot(context)
  const config = await parseConfig({
    root,
    variables: { TEST_PRODUCTION_ROUTES: 'false', TEST_PREBUILT: 'false' }
  })
  const [fixture] = config.webServer
  assert.equal(fixture?.timeout, undefined)
  assert.equal(config.webServer.at(LAST_INDEX)?.timeout, PREVIEW_TIMEOUT)
})

it('writes the report under the application root and tears down with a shipped file', async context => {
  const root = await createRoot(context)
  const config = await parseConfig({
    root,
    variables: { TEST_PRODUCTION_ROUTES: 'true', TEST_PREBUILT: 'false' }
  })
  const [, [, html]] = config.reporter
  assert.equal(
    html.outputFolder,
    path.join(root, 'playwright-report/production')
  )
  assert.equal(config.use.locale, 'en-US')
  await access(config.globalTeardown)
})

it('starts the browser in en-US unless the application chooses a locale', async context => {
  const root = await createRoot(context)
  const variables = { TEST_PRODUCTION_ROUTES: 'false', TEST_PREBUILT: 'false' }
  const config = await parseConfig({ root, variables, options: {} })
  const chosen = await parseConfig({
    root,
    variables,
    options: { locale: 'pt-BR' }
  })
  assert.equal(config.use.locale, 'en-US')
  assert.equal(chosen.use.locale, 'pt-BR')
})

it('rejects a base URL that is missing, has no port or leaves none for the secondary server', async context => {
  const root = await createRoot(context)
  const variables = { TEST_PRODUCTION_ROUTES: 'false', TEST_PREBUILT: 'false' }
  // loadEnvFile keeps a variable that is already set, even an empty one.
  for (const [baseUrl, message] of [
    ['', /must define BASE_URL_TEST/u],
    ['http://127.0.0.1', /explicit port/u],
    ['http://127.0.0.1:65534', /no port for the secondary server/u]
  ] as const) {
    await assert.rejects(
      loadConfig({
        root,
        variables: {
          ...variables,
          BASE_URL_TEST: baseUrl,
          TEST_PUBLICATION_LOAD: 'true'
        }
      }),
      message
    )
  }
})
