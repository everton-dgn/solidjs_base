import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { env, execPath } from 'node:process'
import { it, type TestContext } from 'node:test'
import { promisify } from 'node:util'

import * as v from 'valibot'

type RootOptions = { hasI18n?: boolean }

const PRESET = new URL('../../../dist/vitest.mjs', import.meta.url).href
const exec = promisify(execFile)

// The config holds plugins and a browser provider, which JSON cannot carry, so
// a child process reports only the fields the tests check.
const summaryScript = (root: string): string => `
const { solidTest } = await import(${JSON.stringify(PRESET)})
const plugins = () => [{ name: 'component' }]
const config = solidTest({ root: ${JSON.stringify(root)}, plugins })
const [node, dom, browser] = config.projects
const [stubs] = node.plugins
const ids = ['server-only', 'virtual:file-routes', 'virtual:solid-server-function-handler']
process.stdout.write(JSON.stringify({
  names: config.projects.map(project => project.test.name.label),
  stubs: ids.map(id => stubs.load(stubs.resolveId(id))),
  unknown: ['some-package', 'constructor', 'toString'].map(id => stubs.resolveId(id) ?? null),
  sharesPlugins: dom.plugins[0] === browser.plugins[0],
  setupFiles: browser.test.setupFiles,
  paraglide: browser.resolve?.alias[0].replacement ?? null,
  env: config.env
}))
`

const summarySchema = v.object({
  names: v.array(v.string()),
  stubs: v.array(v.string()),
  unknown: v.array(v.null()),
  sharesPlugins: v.boolean(),
  setupFiles: v.array(v.string()),
  paraglide: v.nullable(v.string()),
  env: v.record(v.string(), v.string())
})

// The browser setup resets the Paraglide locale, so the preset adds it only
// when the application has the Paraglide settings.
async function createRoot(
  context: TestContext,
  { hasI18n = true }: RootOptions = {}
): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'solid-test-root-'))
  // Sandbox created by this test: removing it directly is the right cleanup.
  context.after(() => rm(root, { recursive: true, force: true }))
  if (hasI18n) {
    await mkdir(path.join(root, 'project.inlang'))
    await writeFile(path.join(root, 'project.inlang/settings.json'), '{}')
  }
  return root
}

async function readSummary(root: string) {
  const { HOST: _host, ...inherited } = env
  const { stdout } = await exec(
    execPath,
    ['--input-type=module', '--eval', summaryScript(root)],
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

it('declares the node, dom and browser projects', async context => {
  const summary = await readSummary(await createRoot(context))
  assert.deepEqual(summary.names, ['node', 'dom', 'browser'])
})

it('serves the build-only modules to the node project', async context => {
  const summary = await readSummary(await createRoot(context))
  assert.equal(summary.stubs[0], 'export default undefined')
  assert.match(summary.stubs[1] ?? '', /export const pageRoutes = \[\]/u)
  assert.equal(summary.stubs[2], "export const endpoint = '/_server'")
  // Prototype keys of a plain object would pass an `in` check.
  assert.deepEqual(summary.unknown, [null, null, null])
})

it('gives the dom and browser projects their own plugin instances', async context => {
  const summary = await readSummary(await createRoot(context))
  assert.equal(summary.sharesPlugins, false)
})

it('points the browser setup to a file the package ships', async context => {
  const summary = await readSummary(await createRoot(context))
  assert.equal(summary.setupFiles.length, 1)
  await Promise.all(summary.setupFiles.map(file => access(file)))
})

it('maps the Paraglide modules to the application folder', async context => {
  const root = await createRoot(context)
  const summary = await readSummary(root)
  assert.equal(summary.paraglide, `${path.join(root, 'paraglide')}/`)
})

it('adds no Paraglide setup or alias without the Paraglide settings', async context => {
  const summary = await readSummary(
    await createRoot(context, { hasI18n: false })
  )
  assert.deepEqual(summary.setupFiles, [])
  assert.equal(summary.paraglide, null)
})

it('passes only the test variables that are set', async context => {
  const summary = await readSummary(await createRoot(context))
  assert.deepEqual(summary.env, {
    BASE_URL_TEST: 'http://127.0.0.1:4317',
    PORT: '4317'
  })
})
