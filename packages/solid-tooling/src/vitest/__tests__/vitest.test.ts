import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import {
  access,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { env, execPath } from 'node:process'
import { it, type TestContext } from 'node:test'
import { promisify } from 'node:util'

import * as v from 'valibot'

type RootOptions = { hasI18n?: boolean }
type ResolveOptions = { root: string; ids: string[]; sourcePackages?: string[] }
type InstallOptions = { context: TestContext; folder: string; name: string }

const PRESET = new URL('../../../dist/vitest.mjs', import.meta.url).href
const RUNTIME = '@evertondgn/solid-runtime'
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

const resolveScript = ({
  root,
  ids,
  sourcePackages
}: ResolveOptions): string => `
const { solidTest } = await import(${JSON.stringify(PRESET)})
const config = solidTest({
  root: ${JSON.stringify(root)},
  plugins: () => [],
  sourcePackages: ${JSON.stringify(sourcePackages)}
})
const [node] = config.projects
const resolver = node.plugins.find(plugin => plugin.name === 'solid-tooling:source-packages')
const ids = ${JSON.stringify(ids)}
process.stdout.write(JSON.stringify(await Promise.all(ids.map(id => resolver.resolveId(id)))))
`

const resolvedSchema = v.array(v.nullable(v.string()))

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

// The package folder sits outside node_modules and is reached by a link, as
// with a workspace or Bun's isolated linker. Returns the real path of its
// source file.
async function installSourcePackage({
  context,
  folder,
  name
}: InstallOptions): Promise<string> {
  const store = await mkdtemp(path.join(tmpdir(), 'solid-test-package-'))
  // Sandbox created by this test: removing it directly is the right cleanup.
  context.after(() => rm(store, { recursive: true, force: true }))
  await mkdir(path.join(store, 'src'))
  await writeFile(path.join(store, 'src/headers.ts'), 'export {}\n')
  await writeFile(path.join(store, 'src/constants.js'), 'export {}\n')
  await writeFile(
    path.join(store, 'package.json'),
    JSON.stringify({
      name,
      exports: {
        './headers': { solid: './src/headers.ts' },
        './constants': { default: './src/constants.js' },
        './nested': {
          solid: { import: './src/headers.ts' },
          default: './src/constants.js'
        }
      }
    })
  )
  const link = path.join(folder, 'node_modules', name)
  await mkdir(path.dirname(link), { recursive: true })
  await symlink(store, link)
  return realpath(path.join(store, 'src/headers.ts'))
}

async function resolveIds(options: ResolveOptions) {
  const { stdout } = await exec(execPath, [
    '--input-type=module',
    '--eval',
    resolveScript(options)
  ])
  return v.parse(resolvedSchema, JSON.parse(stdout))
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

it('resolves the source subpaths of an installed package to their real paths', async context => {
  const root = await createRoot(context)
  const source = await installSourcePackage({
    context,
    folder: root,
    name: RUNTIME
  })
  const resolved = await resolveIds({ root, ids: [`${RUNTIME}/headers`] })
  assert.deepEqual(resolved, [source])
})

it('leaves the other conditions and unknown subpaths to Vite', async context => {
  const root = await createRoot(context)
  await installSourcePackage({ context, folder: root, name: RUNTIME })
  const resolved = await resolveIds({
    root,
    ids: [`${RUNTIME}/constants`, `${RUNTIME}/missing`, RUNTIME, 'solid-js']
  })
  assert.deepEqual(resolved, [null, null, null, null])
})

it('leaves a solid condition that nests other conditions to Vite', async context => {
  const root = await createRoot(context)
  await installSourcePackage({ context, folder: root, name: RUNTIME })
  const resolved = await resolveIds({ root, ids: [`${RUNTIME}/nested`] })
  assert.deepEqual(resolved, [null])
})

it('finds the package in a parent folder, as Node does', async context => {
  const workspace = await createRoot(context)
  const root = path.join(workspace, 'apps/web')
  await mkdir(root, { recursive: true })
  const source = await installSourcePackage({
    context,
    folder: workspace,
    name: RUNTIME
  })
  const resolved = await resolveIds({ root, ids: [`${RUNTIME}/headers`] })
  assert.deepEqual(resolved, [source])
})

it('resolves nothing when the source package is not installed', async context => {
  const root = await createRoot(context)
  const resolved = await resolveIds({ root, ids: [`${RUNTIME}/headers`] })
  assert.deepEqual(resolved, [null])
})

it('takes the list of source packages as an option', async context => {
  const root = await createRoot(context)
  const source = await installSourcePackage({
    context,
    folder: root,
    name: '@acme/ui'
  })
  await installSourcePackage({ context, folder: root, name: RUNTIME })
  const resolved = await resolveIds({
    root,
    ids: ['@acme/ui/headers', `${RUNTIME}/headers`],
    sourcePackages: ['@acme/ui']
  })
  assert.deepEqual(resolved, [source, null])
})
