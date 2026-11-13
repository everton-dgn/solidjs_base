import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { env, execPath } from 'node:process'
import { it } from 'node:test'
import { promisify } from 'node:util'

import * as v from 'valibot'

const PRESET = new URL('../../../dist/vitest.mjs', import.meta.url).href
const ROOT = '/srv/app'
const exec = promisify(execFile)

// The config holds plugins and a browser provider, which JSON cannot carry, so
// a child process reports only the fields the tests check.
const SUMMARY_SCRIPT = `
const { solidTest } = await import(${JSON.stringify(PRESET)})
const config = solidTest({ root: ${JSON.stringify(ROOT)}, plugins: [] })
const [node, , browser] = config.projects
const [stubs] = node.plugins
const ids = ['server-only', 'virtual:file-routes', 'virtual:solid-server-function-handler']
process.stdout.write(JSON.stringify({
  names: config.projects.map(project => project.test.name.label),
  stubs: ids.map(id => stubs.load(stubs.resolveId(id))),
  unknown: stubs.resolveId('some-package') ?? null,
  setupFiles: browser.test.setupFiles,
  paraglide: browser.resolve.alias[0].replacement,
  env: config.env
}))
`

const summarySchema = v.object({
  names: v.array(v.string()),
  stubs: v.array(v.string()),
  unknown: v.null(),
  setupFiles: v.array(v.string()),
  paraglide: v.string(),
  env: v.record(v.string(), v.string())
})

async function readSummary() {
  const { HOST: _host, ...inherited } = env
  const { stdout } = await exec(
    execPath,
    ['--input-type=module', '--eval', SUMMARY_SCRIPT],
    {
      env: {
        ...inherited,
        BASE_URL_TEST: 'http://127.0.0.1:4317',
        PORT: '4317'
      }
    }
  )
  return v.parse(summarySchema, JSON.parse(stdout))
}

it('declares the node, dom and browser projects', async () => {
  const summary = await readSummary()
  assert.deepEqual(summary.names, ['node', 'dom', 'browser'])
})

it('serves the build-only modules to the node project', async () => {
  const summary = await readSummary()
  assert.equal(summary.stubs[0], 'export default undefined')
  assert.match(summary.stubs[1] ?? '', /export const pageRoutes = \[\]/u)
  assert.equal(summary.stubs[2], "export const endpoint = '/_server'")
  assert.equal(summary.unknown, null)
})

it('points the browser setup to a file the package ships', async () => {
  const summary = await readSummary()
  assert.equal(summary.setupFiles.length, 1)
  await Promise.all(summary.setupFiles.map(file => access(file)))
})

it('maps the Paraglide modules to the application folder', async () => {
  const summary = await readSummary()
  assert.equal(summary.paraglide, `${path.join(ROOT, 'paraglide')}/`)
})

it('passes only the test variables that are set', async () => {
  const summary = await readSummary()
  assert.deepEqual(summary.env, {
    BASE_URL_TEST: 'http://127.0.0.1:4317',
    PORT: '4317'
  })
})
