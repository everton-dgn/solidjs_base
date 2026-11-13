import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { env, execPath } from 'node:process'
import { it, type TestContext } from 'node:test'
import { promisify } from 'node:util'

import * as v from 'valibot'

type Scenario = {
  options?: Record<string, unknown>
  mode?: string
  hasExtension?: boolean
  hasStubs?: boolean
  variables?: Record<string, string>
}

type Summary = v.InferOutput<typeof summarySchema>
type CallQuery = { summary: Summary; name: string }
type KeyQuery = { value: unknown; key: string }
type WorkspaceGlob = { pattern: string; base: string }

const PRESET = new URL('../../../dist/vite.mjs', import.meta.url).href
const exec = promisify(execFile)
const HEADERS = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'cross-origin-resource-policy': 'same-origin'
}
const SECURITY_HEADERS = {
  ...HEADERS,
  'content-security-policy': "default-src 'self'"
}
const LOCALES = ['en', 'pt']
const TASKS = [
  'i18n-generate',
  'lint-css',
  'dead-code-project',
  'lint-project',
  'check-project',
  'typecheck-node',
  'test-tooling'
]
const WORKSPACE = {
  dependsOn: ['@scope/tooling#build'],
  inputs: ['packages/tooling/dist/**']
}

// Recorders stand in for the four plugin packages, whose options stay in
// closures. Each module also records that it was imported.
const STUBS = {
  '@solidjs/vite-plugin':
    "record('solid'); export default options => (record('solid', options), { name: 'solid' })",
  'filesystem-routing/vite':
    "record('fileRoutes'); export const fileRoutes = options => (record('fileRoutes', options), { name: 'fileRoutes' })",
  'unplugin-icons/vite':
    "record('icons'); export default options => { const props = {}; options.iconCustomizer('collection', 'icon', props); record('icons', { ...options, iconCustomizer: props }); return { name: 'icons' } }",
  'unplugin-icons/loaders':
    "record('loaders'); export const FileSystemIconLoader = folder => ({ folder })",
  'nitro/vite':
    "record('nitro'); export const nitro = options => (record('nitro', { ...options, modules: options.modules.map(module => module.name) }), [{ name: 'nitro' }])"
}

// The config holds plugins, promises and a browser provider, which JSON cannot
// carry, so a child process reports only what the tests check.
function childScript({
  options = {},
  mode = 'production',
  hasExtension = true,
  hasStubs = true
}: Scenario): string {
  return `
import { registerHooks } from 'node:module'
const record = (name, options) => (globalThis.solidAppCalls ??= []).push(options === undefined ? ['import', name] : [name, options])
globalThis.record = record
const stubs = ${hasStubs ? JSON.stringify(STUBS) : '{}'}
registerHooks({
  resolve(specifier, context, next) {
    const source = stubs[specifier]
    if (source === undefined) return next(specifier, context)
    const url = 'data:text/javascript,' + encodeURIComponent('const { record } = globalThis; ' + source)
    return { url, shortCircuit: true }
  }
})
const extendCalls = []
const extend = context => {
  extendCalls.push(context)
  return {
    plugins: [{ name: 'extension:' + context.target }],
    nitroModules: [{ name: 'extension-module', setup() {} }]
  }
}
const names = async value => {
  const resolved = await value
  if (!resolved) return []
  if (Array.isArray(resolved)) return (await Promise.all(resolved.map(names))).flat()
  return [resolved.name]
}
const summary = { error: null, calls: [], extendCalls, plugins: { app: [], dom: [], browser: [] }, tasks: {}, build: null, server: null, preview: null, setupFiles: [], testEnv: null }
try {
  const { defineSolidApp } = await import(${JSON.stringify(PRESET)})
  const options = ${JSON.stringify({ securityHeaders: SECURITY_HEADERS, ...options })}
  const app = defineSolidApp(${hasExtension ? '{ ...options, extend }' : 'options'})
  const config = await app({ mode: ${JSON.stringify(mode)}, command: 'build' })
  const [, dom, browser] = config.test.projects
  summary.plugins = {
    app: (await names(config.plugins)).filter(name => !name.startsWith('vite-plus:')),
    dom: await names(dom.plugins),
    browser: await names(browser.plugins)
  }
  Object.assign(summary, { tasks: config.run.tasks, build: config.build, server: config.server, preview: config.preview, setupFiles: browser.test.setupFiles, testEnv: process.env.SOLID_APP_TEST_PROBE ?? null })
} catch (error) {
  summary.error = error.message
}
summary.calls = globalThis.solidAppCalls ?? []
process.stdout.write(JSON.stringify(summary))
`
}

const namesSchema = v.array(v.string())
const callSchema = v.tuple([v.string(), v.unknown()])
const extendCallSchema = v.object({ target: v.string(), mode: v.string() })
const pluginsSchema = v.object({
  app: namesSchema,
  dom: namesSchema,
  browser: namesSchema
})
const nullableTextSchema = v.nullable(v.string())
const summarySchema = v.object({
  error: nullableTextSchema,
  calls: v.array(callSchema),
  extendCalls: v.array(extendCallSchema),
  plugins: pluginsSchema,
  tasks: v.record(v.string(), v.unknown()),
  build: v.unknown(),
  server: v.unknown(),
  preview: v.unknown(),
  setupFiles: namesSchema,
  testEnv: nullableTextSchema
})
const commandSchema = v.object({ command: v.string() })
const nitroSchema = v.object({
  routeRules: v.record(v.string(), v.unknown())
})
const staticRuleSchema = v.object({ headers: v.unknown() })
// valibot drops the keys a schema does not list, so routeRules stay out.
const nitroModulesSchema = v.object({
  serverEntry: v.boolean(),
  preset: v.string(),
  modules: v.array(v.string()),
  publicAssets: v.array(v.unknown())
})

async function createRoot(context: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'solid-app-root-'))
  // Sandbox created by this test: removing it directly is the right cleanup.
  context.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, 'project.inlang'))
  await writeFile(
    path.join(root, 'project.inlang/settings.json'),
    JSON.stringify({ baseLocale: 'en', locales: LOCALES })
  )
  await writeFile(path.join(root, '.env'), 'HOST=127.0.0.1\nPORT=4999\n')
  await writeFile(path.join(root, '.env.test'), 'SOLID_APP_TEST_PROBE=loaded\n')
  return root
}

async function readSummary(scenario: Scenario): Promise<Summary> {
  // loadEnv gives the process variables priority over .env.
  const {
    CI: _ci,
    HOST: _host,
    PORT: _port,
    SOLID_APP_TEST_PROBE: _probe,
    VP_RESOLVING_CONFIG_METADATA: _metadata,
    ...inherited
  } = env
  const { stdout } = await exec(
    execPath,
    ['--input-type=module', '--eval', childScript(scenario)],
    { env: { ...inherited, ...scenario.variables } }
  )
  return v.parse(summarySchema, JSON.parse(stdout))
}

function optionsOf({ summary, name }: CallQuery): unknown[] {
  return summary.calls
    .filter(([callName]) => callName === name)
    .map(([, options]) => options)
}

function importsOf(summary: Summary): unknown[] {
  return optionsOf({ summary, name: 'import' })
}

function hasKey({ value, key }: KeyQuery): boolean {
  return value !== null && typeof value === 'object' && key in value
}

// The test projects may finish before the application, so the Solid call of the
// application is the one that turns on SSR.
function splitSolidCalls(summary: Summary): [unknown, unknown[]] {
  const calls = optionsOf({ summary, name: 'solid' })
  return [
    calls.find(value => hasKey({ value, key: 'ssr' })),
    calls.filter(value => !hasKey({ value, key: 'ssr' }))
  ]
}

function fromWorkspace(pattern: string): WorkspaceGlob {
  return { pattern, base: 'workspace' }
}

it('places the extension plugins before the fixed ones in each target', async context => {
  const root = await createRoot(context)
  const summary = await readSummary({ options: { root } })
  assert.equal(summary.error, null)
  assert.deepEqual(summary.plugins, {
    app: ['extension:app', 'icons', 'solid', 'fileRoutes', 'nitro'],
    dom: ['extension:test', 'icons', 'solid', 'fileRoutes'],
    browser: ['extension:test', 'icons', 'solid', 'fileRoutes']
  })
})

it('calls the extension once for the application and once per test project', async context => {
  const root = await createRoot(context)
  const summary = await readSummary({ options: { root } })
  assert.deepEqual(summary.extendCalls, [
    { target: 'app', mode: 'production' },
    { target: 'test', mode: 'production' },
    { target: 'test', mode: 'production' }
  ])
  const nitroCalls = optionsOf({ summary, name: 'nitro' }).map(options =>
    v.parse(nitroModulesSchema, options)
  )
  assert.deepEqual(nitroCalls, [
    {
      serverEntry: false,
      preset: 'vercel',
      modules: ['extension-module'],
      publicAssets: []
    }
  ])
})

it('passes the application paths to Solid, the routes and the icons', async context => {
  const root = await createRoot(context)
  const summary = await readSummary({
    options: {
      root,
      middleware: './src/middleware/index.ts',
      serverSetup: './src/server/setup.ts',
      icons: { 'my-images': './src/assets/images' }
    }
  })
  assert.deepEqual(splitSolidCalls(summary), [
    {
      start: { middleware: './src/middleware/index.ts' },
      ssr: true,
      serverFunctions: { serverSetup: './src/server/setup.ts' }
    },
    [{ serverFunctions: true }, { serverFunctions: true }]
  ])
  assert.deepEqual(optionsOf({ summary, name: 'fileRoutes' }), [
    { types: 'src/@types/routes.d.ts', httpMethods: true },
    { types: 'src/@types/routes.d.ts', httpMethods: true },
    { types: 'src/@types/routes.d.ts', httpMethods: true }
  ])
  const icons = {
    compiler: 'solid',
    iconCustomizer: { 'aria-hidden': 'true' },
    customCollections: {
      'my-images': { folder: path.join(root, 'src/assets/images') }
    }
  }
  assert.deepEqual(optionsOf({ summary, name: 'icons' }), [icons, icons, icons])
})

it('falls back to server functions without setup and no middleware', async context => {
  const root = await createRoot(context)
  const summary = await readSummary({
    options: { root },
    hasExtension: false
  })
  assert.deepEqual(splitSolidCalls(summary)[0], {
    start: {},
    ssr: true,
    serverFunctions: true
  })
  assert.deepEqual(summary.plugins.dom, ['icons', 'solid', 'fileRoutes'])
  const [nitro] = optionsOf({ summary, name: 'nitro' })
  assert.ok(nitro !== null && typeof nitro === 'object')
  assert.deepEqual('modules' in nitro && nitro.modules, [])
})

it('writes the security headers on the static files in a fixed order', async context => {
  const root = await createRoot(context)
  const summary = await readSummary({
    options: {
      root,
      publicAssets: [
        { baseURL: '/images', dir: 'public/images', fallthrough: false }
      ],
      staticPaths: ['/favicon/**'],
      routeRules: { '/api/**': { cors: true } }
    }
  })
  const [nitro] = optionsOf({ summary, name: 'nitro' })
  const { routeRules } = v.parse(nitroSchema, nitro)
  assert.deepEqual(Object.keys(routeRules), [
    '/assets/**',
    '/images/**',
    '/favicon/**',
    '/en/**.md',
    '/pt/**.md',
    '/llms.txt',
    '/llms-full.txt',
    '/sitemap.xml',
    '/sitemaps/pages/**',
    '/_markdown/static.json',
    '/api/**'
  ])
  const staticRules = Object.entries(routeRules).filter(
    ([staticPath]) => staticPath !== '/api/**'
  )
  for (const [, rule] of staticRules) {
    assert.deepEqual(v.parse(staticRuleSchema, rule), { headers: HEADERS })
  }
  assert.deepEqual(routeRules['/api/**'], { cors: true })
})

it('swaps the middleware and the routes in the e2e mode', async context => {
  const root = await createRoot(context)
  const e2e = { middleware: './e2e/middleware.ts', routes: 'e2e/routes' }
  const summary = await readSummary({
    options: { root, middleware: './src/middleware/index.ts', e2e },
    mode: 'e2e'
  })
  assert.deepEqual(splitSolidCalls(summary)[0], {
    start: { middleware: './e2e/middleware.ts' },
    ssr: true,
    serverFunctions: true
  })
  assert.deepEqual(
    optionsOf({ summary, name: 'fileRoutes' }).filter(
      options =>
        options !== null && typeof options === 'object' && 'dir' in options
    ),
    [{ dir: 'e2e/routes', httpMethods: true }]
  )
  assert.deepEqual(summary.build, {
    manifest: true,
    rolldownOptions: { output: { comments: false } }
  })
})

it('keeps the production plugins in the e2e mode without e2e paths', async context => {
  const root = await createRoot(context)
  const summary = await readSummary({
    options: { root, middleware: './src/middleware/index.ts' },
    mode: 'e2e'
  })
  assert.deepEqual(splitSolidCalls(summary)[0], {
    start: { middleware: './src/middleware/index.ts' },
    ssr: true,
    serverFunctions: true
  })
  const routes = { types: 'src/@types/routes.d.ts', httpMethods: true }
  assert.deepEqual(optionsOf({ summary, name: 'fileRoutes' }), [
    routes,
    routes,
    routes
  ])
})

it('loads no application plugin and reads .env.test in the test mode', async context => {
  const root = await createRoot(context)
  const summary = await readSummary({ options: { root }, mode: 'test' })
  assert.deepEqual(summary.plugins.app, [])
  assert.deepEqual(
    summary.extendCalls.map(call => call.target),
    ['test', 'test']
  )
  assert.equal(importsOf(summary).includes('nitro'), false)
  assert.equal(summary.testEnv, 'loaded')
  assert.deepEqual(summary.build, {
    manifest: false,
    rolldownOptions: { output: { comments: false } }
  })
})

it('imports no plugin while Vite+ resolves the config metadata', async context => {
  const root = await createRoot(context)
  const summary = await readSummary({
    options: { root },
    variables: { VP_RESOLVING_CONFIG_METADATA: '1' }
  })
  assert.equal(summary.error, null)
  assert.deepEqual(summary.calls, [])
  assert.deepEqual(summary.extendCalls, [])
  assert.deepEqual(summary.plugins, { app: [], dom: [], browser: [] })
})

it('serves the dev server and the preview on the HOST and PORT of .env', async context => {
  const root = await createRoot(context)
  const summary = await readSummary({ options: { root } })
  assert.deepEqual(summary.server, {
    host: '127.0.0.1',
    port: 4999,
    forwardConsole: true
  })
  assert.deepEqual(summary.preview, { host: '127.0.0.1', port: 4999 })
})

it('declares the tasks with the application inputs outside a workspace', async context => {
  const root = await createRoot(context)
  const summary = await readSummary({ options: { root } })
  assert.deepEqual(Object.keys(summary.tasks), TASKS)
  assert.deepEqual(summary.tasks['lint-css'], {
    command: 'bun tooling/css/check.ts',
    cache: {
      env: ['NODE_ENV'],
      input: [
        { auto: true },
        'src/**/*.css',
        'tooling/css/**',
        'package.json',
        'bun.lock',
        'bunfig.toml'
      ]
    }
  })
  assert.deepEqual(summary.tasks['test-tooling'], {
    command:
      "node --test --test-timeout=60000 'tooling/__tests__/*.test.ts' 'tooling/!(release)/**/__tests__/*.test.ts'",
    cache: false
  })
})

it('reads the lockfile and the package build from the workspace root', async context => {
  const root = await createRoot(context)
  const summary = await readSummary({
    options: { root, workspace: WORKSPACE }
  })
  assert.deepEqual(summary.tasks['lint-css'], {
    command: 'bun tooling/css/check.ts',
    dependsOn: ['@scope/tooling#build'],
    cache: {
      env: ['NODE_ENV'],
      input: [
        { auto: true },
        'src/**/*.css',
        'tooling/css/**',
        'package.json',
        fromWorkspace('bun.lock'),
        fromWorkspace('bunfig.toml'),
        fromWorkspace('packages/tooling/dist/**')
      ]
    }
  })
  assert.deepEqual(summary.tasks['i18n-generate'], {
    command: 'bun tooling/i18n/generate.ts',
    cache: {
      input: [
        'src/**/i18n/*.json',
        'tooling/i18n/**',
        'project.inlang/settings.json',
        'project.inlang/paraglide.config.ts',
        'package.json',
        fromWorkspace('bun.lock')
      ],
      output: ['paraglide/**', '.paraglide/messages/**']
    }
  })
  const dependents = Object.entries(summary.tasks)
    .filter(
      ([, task]) =>
        typeof task === 'object' &&
        task !== null &&
        'dependsOn' in task &&
        Array.isArray(task.dependsOn) &&
        task.dependsOn.includes('@scope/tooling#build')
    )
    .map(([name]) => name)
  assert.deepEqual(dependents, [
    'lint-css',
    'dead-code-project',
    'typecheck-node'
  ])
})

it('limits the tooling test workers on CI', async context => {
  const root = await createRoot(context)
  const summary = await readSummary({
    options: { root },
    variables: { CI: 'true' }
  })
  const { command } = v.parse(commandSchema, summary.tasks['test-tooling'])
  assert.match(command, /^node --test --test-concurrency=3 /u)
})

it('adds and replaces tasks by name', async context => {
  const root = await createRoot(context)
  const summary = await readSummary({
    options: {
      root,
      tasks: { 'lint-css': 'echo css', 'build-docs': { command: 'echo docs' } }
    }
  })
  assert.deepEqual(Object.keys(summary.tasks), [...TASKS, 'build-docs'])
  assert.equal(summary.tasks['lint-css'], 'echo css')
  assert.deepEqual(summary.tasks['build-docs'], { command: 'echo docs' })
})

it('refuses a public assets folder without a path prefix', async context => {
  const root = await createRoot(context)
  const baseUrls = [undefined, '/', '/images/']
  const errors = await Promise.all(
    baseUrls.map(async baseURL => {
      const summary = await readSummary({
        options: { root, publicAssets: [{ baseURL, dir: 'public/images' }] }
      })
      return summary.error
    })
  )
  for (const error of errors) {
    assert.match(
      error ?? '',
      /publicAssets entry for public\/images needs a baseURL/u
    )
  }
})

it('refuses a static path without a leading slash', async context => {
  const root = await createRoot(context)
  const summary = await readSummary({
    options: { root, staticPaths: ['favicon/**'] }
  })
  assert.match(summary.error ?? '', /favicon\/\*\* must start with a slash/u)
})

it('refuses a static path inside a locale folder', async context => {
  const root = await createRoot(context)
  const [staticPath, asset] = await Promise.all([
    readSummary({ options: { root, staticPaths: ['/en/docs/**'] } }),
    readSummary({
      options: { root, publicAssets: [{ baseURL: '/pt', dir: 'public/pt' }] }
    })
  ])
  assert.match(
    staticPath.error ?? '',
    /\/en\/docs\/\*\* is inside a locale folder/u
  )
  assert.match(asset.error ?? '', /\/pt\/\*\* is inside a locale folder/u)
})

it('names the settings file when it cannot read the locales', async context => {
  const root = await createRoot(context)
  const settings = path.join(root, 'project.inlang/settings.json')
  await writeFile(settings, '{ locales')
  const invalid = await readSummary({ options: { root } })
  await rm(settings)
  const missing = await readSummary({ options: { root } })
  for (const summary of [invalid, missing]) {
    assert.match(
      summary.error ?? '',
      /defineSolidApp: cannot read the locales from project\.inlang\/settings\.json/u
    )
  }
})

it('loads the real plugins from the package dependencies', async context => {
  const root = await createRoot(context)
  const summary = await readSummary({ options: { root }, hasStubs: false })
  assert.equal(summary.error, null)
  const order = [
    'extension:app',
    'unplugin-icons',
    'solid',
    'filesystem-routing',
    'nitro:init'
  ]
  const positions = order.map(name => summary.plugins.app.indexOf(name))
  assert.ok(
    positions.every(position => position >= 0),
    summary.plugins.app.join(', ')
  )
  assert.deepEqual(
    positions,
    positions.toSorted((a, b) => a - b)
  )
  assert.equal(summary.plugins.dom.includes('nitro:init'), false)
  await Promise.all(summary.setupFiles.map(file => access(file)))
})
