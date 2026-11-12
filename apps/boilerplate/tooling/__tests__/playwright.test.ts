import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { env, execPath } from 'node:process'
import { it } from 'node:test'
import { promisify } from 'node:util'

import * as v from 'valibot'

const CONFIG = new URL('../playwright.ts', import.meta.url).href
const exec = promisify(execFile)
const LAST_INDEX = -1
const FIXTURE_SERVER_COUNT = 2
const LOAD_SERVER_COUNT = 3
const serverSchema = v.object({ command: v.string(), url: v.string() })
const configSchema = v.object({ webServer: v.array(serverSchema) })
const testPatternsSchema = v.array(v.string())
const loadProjectSchema = v.object({
  name: v.string(),
  testMatch: v.optional(v.string()),
  workers: v.optional(v.number()),
  fullyParallel: v.optional(v.boolean()),
  teardown: v.optional(v.string()),
  testIgnore: v.optional(testPatternsSchema)
})
const loadConfigSchema = v.object({
  fullyParallel: v.boolean(),
  workers: v.optional(v.number()),
  webServer: v.array(serverSchema),
  projects: v.array(loadProjectSchema)
})

it('builds local suites once and only previews an existing production build', async context => {
  const directory = await mkdtemp(path.join(tmpdir(), 'playwright-build-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  await writeFile(
    path.join(directory, 'vp'),
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$COMMAND_LOG"\n',
    { mode: 0o755 }
  )
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
    const { stdout } = await exec(
      execPath,
      [
        '--input-type=module',
        '--eval',
        `const {default: config} = await import(${JSON.stringify(CONFIG)}); process.stdout.write(JSON.stringify(config));`
      ],
      {
        env: {
          ...env,
          TEST_PRODUCTION_ROUTES: options.production,
          TEST_PREBUILT: options.prebuilt
        }
      }
    )
    const config = v.parse(configSchema, JSON.parse(stdout))
    const server = config.webServer.at(LAST_INDEX)
    assert.ok(server)
    const log = path.join(
      directory,
      `commands-${options.production}-${options.prebuilt}`
    )
    await exec('sh', ['-c', server.command], {
      cwd: directory,
      env: {
        ...env,
        PATH: `${directory}${path.delimiter}${env.PATH ?? ''}`,
        COMMAND_LOG: log
      }
    })
    const commands = await readFile(log, 'utf8')
    assert.deepEqual(commands.trim().split('\n'), options.expected)
  }
})

it('rejects prebuilt mode for fixture routes', async () => {
  await assert.rejects(
    exec(
      execPath,
      [
        '--input-type=module',
        '--eval',
        `await import(${JSON.stringify(CONFIG)})`
      ],
      {
        env: { ...env, TEST_PRODUCTION_ROUTES: 'false', TEST_PREBUILT: 'true' }
      }
    ),
    /TEST_PREBUILT requires production routes/u
  )
})

it('refuses to preview an e2e build as a prebuilt production build', async context => {
  const directory = await mkdtemp(path.join(tmpdir(), 'playwright-prebuilt-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(path.join(directory, '.vercel/output/static/.vite'), {
    recursive: true
  })
  await writeFile(
    path.join(directory, 'vp'),
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$COMMAND_LOG"\n',
    { mode: 0o755 }
  )
  const { stdout } = await exec(
    execPath,
    [
      '--input-type=module',
      '--eval',
      `const {default: config} = await import(${JSON.stringify(CONFIG)}); process.stdout.write(JSON.stringify(config));`
    ],
    { env: { ...env, TEST_PRODUCTION_ROUTES: 'true', TEST_PREBUILT: 'true' } }
  )
  const server = v
    .parse(configSchema, JSON.parse(stdout))
    .webServer.at(LAST_INDEX)
  assert.ok(server)
  const log = path.join(directory, 'commands')
  await assert.rejects(
    exec('sh', ['-c', server.command], {
      cwd: directory,
      env: {
        ...env,
        PATH: `${directory}${path.delimiter}${env.PATH ?? ''}`,
        COMMAND_LOG: log
      }
    }),
    { code: 1, stderr: /TEST_PREBUILT found an e2e build/u }
  )
  await assert.rejects(readFile(log, 'utf8'), { code: 'ENOENT' })
})

it('isolates publication saturation from normal fixtures and production routes', async () => {
  for (const isLoadEnabled of [false, true]) {
    const { stdout } = await exec(
      execPath,
      [
        '--input-type=module',
        '--eval',
        `const {default: config} = await import(${JSON.stringify(CONFIG)}); process.stdout.write(JSON.stringify(config));`
      ],
      {
        env: {
          ...env,
          TEST_PRODUCTION_ROUTES: 'false',
          TEST_PREBUILT: 'false',
          TEST_PUBLICATION_LOAD: String(isLoadEnabled)
        }
      }
    )
    const config = v.parse(loadConfigSchema, JSON.parse(stdout))
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
        {
          name: 'publication-load',
          testMatch: '**/PublicationLoad.e2e.test.ts'
        }
      ])
      continue
    }
    assert.equal(config.webServer.length, FIXTURE_SERVER_COUNT)
    const chromium = config.projects.find(
      project => project.name === 'chromium'
    )
    assert.ok(chromium?.testIgnore?.includes('**/PublicationLoad.e2e.test.ts'))
    assert.ok(chromium?.testIgnore?.includes('**/Markdown/*.e2e.test.ts'))
    const markdown = config.projects.find(
      project => project.name === 'markdown'
    )
    assert.deepEqual(markdown, {
      name: 'markdown',
      testMatch: '**/Markdown/*.e2e.test.ts',
      workers: 1,
      fullyParallel: false,
      teardown: 'server-logs'
    })
  }
  await assert.rejects(
    exec(
      execPath,
      [
        '--input-type=module',
        '--eval',
        `await import(${JSON.stringify(CONFIG)})`
      ],
      {
        env: {
          ...env,
          TEST_PRODUCTION_ROUTES: 'true',
          TEST_PREBUILT: 'false',
          TEST_PUBLICATION_LOAD: 'true'
        }
      }
    ),
    /TEST_PUBLICATION_LOAD requires fixture routes/u
  )
})
