import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { execPath } from 'node:process'
import { it, type TestContext } from 'node:test'
import { promisify } from 'node:util'

import * as v from 'valibot'

import { createAppFixture } from '../../testing/appFixture/index.ts'

type Summary = v.InferOutput<typeof summarySchema>

type ConfigQuery = {
  root: string
  options?: Record<string, unknown>
}

const PRESET = new URL('../../../dist/knip.mjs', import.meta.url).href
const PAGE = 'export default function Page() { return null }\n'
const HANDLER = 'export function GET() { return new Response() }\n'
const FULL_APP = {
  'src/entry-server.tsx': PAGE,
  'src/entry-client.tsx': PAGE,
  'src/middleware/index.ts': HANDLER,
  'paraglide/runtime.js': 'export {}\n',
  'env.ts': 'export {}\n',
  'src/routes/index.tsx': PAGE,
  'src/routes/health.ts': HANDLER,
  'src/tests/fixtures/routes/index.tsx': PAGE,
  'src/tests/fixtures/e2e/routes/probe.tsx': PAGE,
  'tooling/script.ts': 'export {}\n'
}
const BARE_APP = { 'src/routes/index.tsx': PAGE }
const exec = promisify(execFile)

const strings = v.array(v.string())
const summarySchema = v.object({
  entry: strings,
  project: strings,
  'filesystem-routing': v.literal(false),
  ignoreBinaries: v.optional(strings),
  ignoreDependencies: v.optional(strings),
  ignoreIssues: v.record(v.string(), strings),
  exclude: v.optional(strings),
  treatConfigHintsAsErrors: v.literal(true)
})

// The child runs from the application root, so the routing package can only
// come from the compiled module.
async function readConfig({
  root,
  options = {}
}: ConfigQuery): Promise<Summary> {
  const script = `
const { defineKnipConfig } = await import(${JSON.stringify(PRESET)})
const options = { root: ${JSON.stringify(root)}, ...${JSON.stringify(options)} }
process.stdout.write(JSON.stringify(await defineKnipConfig(options)()))
`
  const { stdout } = await exec(
    execPath,
    ['--input-type=module', '--eval', script],
    { cwd: root }
  )
  return v.parse(summarySchema, JSON.parse(stdout))
}

function createApp(context: TestContext): Promise<string> {
  return createAppFixture({ context, files: FULL_APP })
}

it('lists the convention entries, the routes and the fixture routes', async context => {
  const config = await readConfig({ root: await createApp(context) })
  assert.deepEqual(config.entry.toSorted(), [
    'env.ts!',
    'paraglide/runtime.js!',
    'src/entry-client.tsx!',
    'src/entry-server.tsx!',
    'src/middleware/index.ts!',
    'src/routes/health.ts!',
    'src/routes/index.tsx!',
    'src/tests/fixtures/e2e/routes/probe.tsx',
    'src/tests/fixtures/routes/index.tsx'
  ])
  assert.ok(config.project.includes('tooling/**/*.ts'))
})

it('leaves out the defaults the application does not have', async context => {
  const root = await createAppFixture({ context, files: BARE_APP })
  const config = await readConfig({ root })
  assert.deepEqual(config.entry, ['src/routes/index.tsx!'])
  assert.deepEqual(config.project, [
    'src/**/*.{ts,tsx}!',
    '!src/tests/**!',
    '!src/**/__tests__/**!',
    '!src/**/*.test.{ts,tsx}!'
  ])
  assert.equal(config.ignoreBinaries, undefined)
  assert.equal(config.ignoreDependencies, undefined)
  assert.equal(config.exclude, undefined)
})

it('ignores unlisted dependencies only in the config file', async context => {
  const root = await createAppFixture({ context, files: BARE_APP })
  const config = await readConfig({ root })
  assert.deepEqual(config.ignoreIssues, { 'tooling/knip.ts': ['unlisted'] })
  const moved = await readConfig({ root, options: { configFile: 'knip.ts' } })
  assert.deepEqual(moved.ignoreIssues, { 'knip.ts': ['unlisted'] })
})

it('adds the application settings without repeating entries', async context => {
  const config = await readConfig({
    root: await createApp(context),
    options: {
      entry: ['src/entry-server.tsx!', 'src/api/index.ts!'],
      ignoreBinaries: ['kingfisher'],
      ignoreDependencies: ['server-only'],
      ignoreIssues: {
        'tooling/knip.ts': ['exports'],
        'src/a.test.ts': ['unlisted']
      },
      exclude: ['catalogReferences']
    }
  })
  assert.equal(
    config.entry.filter(entry => entry === 'src/entry-server.tsx!').length,
    1
  )
  assert.ok(config.entry.includes('src/api/index.ts!'))
  assert.deepEqual(config.ignoreBinaries, ['kingfisher'])
  assert.deepEqual(config.ignoreDependencies, ['server-only'])
  assert.deepEqual(config.ignoreIssues, {
    'tooling/knip.ts': ['exports', 'unlisted'],
    'src/a.test.ts': ['unlisted']
  })
  assert.deepEqual(config.exclude, ['catalogReferences'])
})
