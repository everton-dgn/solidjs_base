/* oxlint-disable node/no-sync -- The test owns each temporary application and inspects artifacts between awaited commands. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { env, stdout } from 'node:process'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'

import * as v from 'valibot'

import {
  assertFontBuild,
  assertFontHtml,
  mutateFontsScenario,
  prepareFontsScenario
} from '../font-scenarios.ts'
import { smokeMiddleware } from '../middleware-smoke.ts'
import {
  assertGuidePlugin,
  checkBrowserCloseFailure,
  checkHandlerFailure,
  checkLaunchFailure,
  checkNoServer,
  checkProfileFailure,
  checkServerContainment
} from '../no-server-scenarios.ts'
import { mutatePublication } from '../publication-mutations.ts'
import { PUBLICATION_PROFILES } from '../publication-scenarios.ts'
import { smokePublication } from '../publication-smoke.ts'
import {
  assertEnvBootFailure,
  checkEnvBundle,
  checkEnvFailures,
  instrument,
  instrumentMiddleware,
  mutateLocaleStandIn,
  mutateTheme,
  prepareEnvScenario
} from '../scenario-mutations.ts'
import { run, stopChild, childEnvironment } from '../scenario-process.ts'
import {
  checkSeoOriginFailures,
  prepareSeoScenario,
  seoEnvironment
} from '../seo-scenarios.ts'
import { assertSeoBuild, smokeSeo } from '../seo-smoke.ts'
import {
  assertServerErrorLog,
  importServerFromClient,
  mutateServerErrors,
  smokeServerErrors
} from '../server-errors.ts'
import { checkStaticOutput } from '../static-output-scenario.ts'
import { smokeTheme } from '../theme-smoke.ts'
import {
  checkApplicationVersions,
  checkPackageEngines,
  readPinned
} from '../workspace-versions.ts'

const ROOT = path.resolve(import.meta.dirname, '../../../../..')
const SCENARIOS = ['client-only', 'ssr-plain', 'ssr-i18n']
const LINKERS = ['hoisted', 'isolated']
const SCENARIO_TIMEOUT = 150_000
const PREVIEW_TIMEOUT = 15_000
const CHECK_TIMEOUT = 30_000
const REQUEST_TIMEOUT = 1000
const POLL_INTERVAL = 100
const HTTP_OK = 200
const HTTP_SERVER_ERROR = 500
const HTTP_TEMPORARY_REDIRECT = 307
// Nitro and routing have runtime entries; their build adapters must stay out.
const BUILD_TOOLS =
  /\/node_modules\/(?:@evertondgn\/solid-tooling\/|@evertondgn\/vite-plugin-solid-icons\/|@commitlint\/|@vitest\/|@testing-library\/|@playwright\/|@inlang\/sdk\/|(?:knip|typescript|happy-dom|playwright|playwright-core|lefthook|eslint-plugin-solid|stylelint|stylelint-use-nesting)\/|nitro\/dist\/(?:builder|vite|cli|presets\/[^/]+\/(?!runtime\/))|filesystem-routing\/dist\/(?:index|vite)|@solidjs\/vite-plugin\/dist\/esm\/index)/u
const configSchema = v.object({
  plugins: v.array(v.string()),
  tasks: v.array(v.string())
})
const headersSchema = v.record(v.string(), v.string())
const routeSchema = v.object({
  src: v.optional(v.string()),
  headers: v.optional(headersSchema)
})
const publicationSchema = v.object({ routes: v.array(routeSchema) })
const versionsSchema = v.optional(v.record(v.string(), v.string()), {})
const manifestSchema = v.looseObject({
  dependencies: v.record(v.string(), v.string()),
  overrides: versionsSchema
})
const MUTATION = env.SCENARIO_MUTATION
const ICONS_PACKAGE = '@evertondgn/vite-plugin-solid-icons'
const ICON_TYPES = 'src/icon-collections.d.ts'
// The tooling depends on the icons plugin; the application does not declare it.
const PACKED = ['solid-tooling', 'solid-runtime', 'vite-plugin-solid-icons']

type Target = { app: string; scenario: string }
type PreviewTarget = Target & { hasInvalidPort?: boolean }

type PackedMutation = { archive: string; deadline: number; name: string }

const skillSchema = v.object({ path: v.string(), package: v.string() })
const inventorySchema = v.object({ skills: v.array(skillSchema) })
type DiagnosticsTarget = { app: string; deadline: number }

async function checkDiagnostics({ app, deadline }: DiagnosticsTarget) {
  const instructions = path.join(app, 'AGENTS.md')
  const check = (expectedError: RegExp) =>
    run({
      cwd: app,
      deadline,
      args: ['run', 'agents', '--check'],
      expectedError,
      expectedCode: 1
    })
  assert.equal(existsSync(instructions), false)
  await check(/AGENTS\.md: missing/u)
  for (const [command, option] of [
    ['agents', '--json'],
    ['doctor', '--check']
  ] as const) {
    await run({
      deadline,
      cwd: app,
      args: ['run', command, option],
      expectedError: /Unknown option/u
    })
  }
  assert.equal(existsSync(instructions), false)
  await run({ deadline, cwd: app, args: ['run', 'agents'] })
  const generated = readFileSync(instructions)
  await run({ deadline, cwd: app, args: ['run', 'agents', '--check'] })
  await run({ deadline, cwd: app, args: ['run', 'agents'] })
  assert.deepEqual(readFileSync(instructions), generated)
  const stale = generated
    .toString()
    .replace('Before changing code', 'Before editing code')
  writeFileSync(instructions, stale)
  await check(/AGENTS\.md: outdated/u)
  assert.deepEqual(readFileSync(instructions), Buffer.from(stale))
  writeFileSync(instructions, generated)
  const configured = await run({
    deadline,
    cwd: app,
    args: ['run', 'doctor', '--json']
  })
  assert.match(configured, /"vp run check-project"/u)
  // The direct command remains available even when the preset cannot load.
  const child = path.join(app, 'nested')
  mkdirSync(child)
  writeFileSync(
    path.join(child, 'package.json'),
    readFileSync(path.join(app, 'package.json'))
  )
  writeFileSync(
    path.join(child, 'vite.config.ts'),
    "throw new Error('invalid scenario config')"
  )
  const command =
    /If the Vite config fails to load, run `(?<command>[^`]+)`/u.exec(
      generated.toString()
    )?.groups?.command
  assert.ok(command)
  const diagnostic = await run({
    deadline,
    cwd: child,
    file: 'sh',
    args: ['-c', `${command} --json`]
  })
  const inventory = v.parse(inventorySchema, JSON.parse(diagnostic))
  for (const name of [
    '@evertondgn/solid-tooling',
    '@evertondgn/solid-runtime',
    '@evertondgn/vite-plugin-solid-icons',
    'solid-js'
  ]) {
    assert.ok(
      inventory.skills.some(skill => skill.package === name),
      name
    )
  }
  for (const skill of inventory.skills) {
    assert.ok(readFileSync(skill.path, 'utf8').startsWith('---'))
  }
}

async function removePackedDependency({
  archive,
  deadline,
  name
}: PackedMutation): Promise<void> {
  if (name !== 'solid-tooling' || MUTATION !== 'missing-dependency') return
  const unpacked = path.join(path.dirname(archive), 'unpacked')
  mkdirSync(unpacked)
  await run({ deadline, cwd: unpacked, file: 'tar', args: ['-xzf', archive] })
  const file = path.join(unpacked, 'package/package.json')
  const manifest = v.parse(
    manifestSchema,
    JSON.parse(readFileSync(file, 'utf8'))
  )
  assert.ok(manifest.dependencies['@evertondgn/vite-plugin-solid-icons'])
  delete manifest.dependencies['@evertondgn/vite-plugin-solid-icons']
  writeFileSync(file, JSON.stringify(manifest))
  await run({
    deadline,
    cwd: unpacked,
    file: 'tar',
    args: ['-czf', archive, 'package']
  })
}

type PackedWorkspace = {
  dependencies: Record<string, string>
  overrides: Record<string, string>
}

// The packed tooling pins the version of the icons plugin of this tree, which
// npm may not have yet or may hold with other code; the override installs the
// one of this tree.
async function packWorkspace({
  directory,
  deadline
}: {
  directory: string
  deadline: number
}): Promise<PackedWorkspace> {
  const packed: PackedWorkspace = { dependencies: {}, overrides: {} }
  for (const name of PACKED) {
    const destination = path.join(directory, name)
    await run({
      deadline,
      cwd: path.join(ROOT, 'packages', name),
      args: ['pm', 'pack', '--pack-destination', destination]
    })
    const tarball = readdirSync(destination).find(file => file.endsWith('.tgz'))
    assert.ok(tarball)
    const archive = path.join(destination, tarball)
    await removePackedDependency({ archive, deadline, name })
    const group =
      `@evertondgn/${name}` === ICONS_PACKAGE ? 'overrides' : 'dependencies'
    packed[group][`@evertondgn/${name}`] = archive
  }
  return packed
}

// The tests already write the icon declarations, so the file is removed and
// the task has to write it again before lint and tsrs.
async function regenerateIconTypes({
  app,
  deadline
}: {
  app: string
  deadline: number
}): Promise<void> {
  rmSync(path.join(app, ICON_TYPES))
  await run({ deadline, cwd: app, args: ['run', 'icons-generate'] })
  assert.ok(existsSync(path.join(app, ICON_TYPES)))
}

async function freePort(): Promise<number> {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address !== null && typeof address === 'object')
  const { port } = address
  const closed = once(server, 'close')
  server.close()
  await closed
  return port
}

async function smoke({
  app,
  scenario,
  hasInvalidPort = false
}: PreviewTarget): Promise<void> {
  const port = await freePort()
  const child = spawn(
    path.join(app, 'node_modules/.bin/vp'),
    ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: app,
      env: {
        ...childEnvironment(),
        ...seoEnvironment(app),
        SCENARIO_LABEL: 'scenario-preview-value',
        ...(hasInvalidPort ? { PORT: 'abc' } : {})
      },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )
  let output = ''
  child.stdout.on('data', chunk => {
    output += chunk
  })
  child.stderr.on('data', chunk => {
    output += chunk
  })
  const closed = once(child, 'close')
  const deadline = Date.now() + PREVIEW_TIMEOUT
  try {
    let response: Response | undefined
    while (Date.now() < deadline) {
      assert.equal(child.exitCode, null, output)
      try {
        response = await fetch(
          `http://127.0.0.1:${port}/${scenario === 'ssr-i18n' ? 'fr' : ''}`,
          {
            signal: AbortSignal.timeout(REQUEST_TIMEOUT)
          }
        )
        break
      } catch {
        await delay(POLL_INTERVAL)
      }
    }
    assert.ok(response, `Preview did not start: ${output}`)
    if (hasInvalidPort) {
      assert.equal(
        response.status,
        HTTP_SERVER_ERROR,
        'Invalid PORT must prevent server boot'
      )
      return
    }
    assert.equal(response.status, HTTP_OK)
    const html = await response.text()
    assertFontHtml({ app, scenario, html })
    assert.match(html, /<main[^>]*>Scenario application<\/main>/u)
    if (scenario === 'ssr-plain') {
      assert.equal(
        response.headers.get('x-scenario-env'),
        'scenario-preview-value'
      )
      assert.match(html, /data-env="scenario-client-value"/u)
    }
    if (scenario === 'ssr-i18n') {
      assert.match(
        html,
        MUTATION === 'locale-tag'
          ? /<html[^>]* lang="ja-JP"/u
          : /<html[^>]* lang="fr-FR"/u,
        'Runtime localeTag must set the document language tag'
      )
      const origin = `http://127.0.0.1:${port}`
      await smokeTheme({ mutation: MUTATION, html, response, origin })
      const redirect = await fetch(origin, {
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT)
      })
      assert.equal(
        redirect.status,
        HTTP_TEMPORARY_REDIRECT,
        'Locale root redirect'
      )
      assert.equal(
        redirect.headers.get('location'),
        `${origin}/${MUTATION === 'request-target' ? 'ja' : 'fr'}`,
        'Locale redirect destination'
      )
      assert.match(redirect.headers.get('set-cookie') ?? '', /locale=fr/u)
      const german = await fetch(`${origin}/de`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT)
      })
      assert.equal(german.status, HTTP_OK)
      assert.equal(german.headers.get('content-language'), 'de')
      const germanHtml = await german.text()
      assert.match(germanHtml, /Hallo Welt/u)
      assert.match(germanHtml, /<html[^>]* lang="de-DE"/u)
      assert.match(german.headers.get('set-cookie') ?? '', /locale=de/u)
    }
    const localizedPrefix = MUTATION === 'locale-prefix' ? '/de' : '/fr'
    const prefix = scenario === 'ssr-i18n' ? localizedPrefix : ''
    assert.ok(
      html.includes(`href="${prefix}/about"`),
      `Runtime locale link: ${html}`
    )
    const headers = {
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-embedder-policy': 'require-corp'
    }
    for (const [name, value] of Object.entries(headers)) {
      assert.equal(response.headers.get(name), value, name)
    }
    assert.equal(
      response.headers.get('cross-origin-resource-policy'),
      'same-origin'
    )
    assert.match(
      response.headers.get('strict-transport-security') ?? '',
      /max-age=/u
    )
    assert.match(
      response.headers.get('content-security-policy') ?? '',
      /script-src/u
    )
    await smokeServerErrors({ origin: `http://127.0.0.1:${port}`, scenario })
    await smokeMiddleware({ origin: `http://127.0.0.1:${port}`, scenario })
    await smokeSeo({ app, scenario, origin: `http://127.0.0.1:${port}`, html })
    await smokePublication({
      app,
      scenario,
      origin: `http://127.0.0.1:${port}`
    })
  } finally {
    stopChild(child)
    await closed
    if (hasInvalidPort) assertEnvBootFailure(output)
  }
  assertServerErrorLog(output)
  assert.ok(
    output.includes('[middleware] Unexpected failure; private details omitted')
  )
}

function assertBuild({ app, scenario }: Target): void {
  const source = readFileSync(path.join(app, 'scenario-config.json'), 'utf8')
  const config = v.parse(configSchema, JSON.parse(source))
  const modules = readdirSync(app).filter(file =>
    file.startsWith('scenario-modules-')
  )
  assert.ok(modules.length > 0, 'Build module audit must run')
  let hasServerEnv = false
  for (const file of modules) {
    const content = readFileSync(path.join(app, file), 'utf8')
    const ids = v.parse(v.array(v.string()), JSON.parse(content))
    for (const id of ids) {
      if (checkEnvBundle({ id, scenario, file })) {
        hasServerEnv = true
      }
      assert.doesNotMatch(
        id,
        BUILD_TOOLS,
        'Build bundled a packaged development tool'
      )
    }
    stdout.write(
      `${scenario}: audited ${ids.length} module IDs in ${file}, no development tools\n`
    )
  }
  assert.equal(hasServerEnv, scenario === 'ssr-plain')
  assert.ok(config.tasks.includes('icons-generate'))
  assert.ok(config.plugins.includes('vite-plugin-solid-icons'))
  if (scenario === 'ssr-i18n') {
    assert.ok(config.tasks.includes('i18n-generate'))
    assert.ok(config.plugins.includes('project:i18n-catalogs'))
    assert.ok(config.plugins.includes('unplugin-paraglide-js'))
    const publication = readFileSync(
      path.join(app, '.vercel/output/config.json'),
      'utf8'
    )
    const { routes } = v.parse(publicationSchema, JSON.parse(publication))
    for (const locale of ['fr', 'de', 'it', 'ja']) {
      const rule = routes.find(
        route =>
          route.src !== undefined &&
          route.headers !== undefined &&
          new RegExp(route.src, 'u').test(`/${locale}/page.md`)
      )
      assert.ok(rule, `${locale} publication rule`)
      assert.ok(rule.headers)
      assert.equal(rule.headers['x-content-type-options'], 'nosniff')
      assert.equal(rule.headers['cross-origin-resource-policy'], 'same-origin')
      assert.equal(
        rule.headers['strict-transport-security'],
        'max-age=63072000; includeSubDomains'
      )
    }
  }
  if (scenario !== 'ssr-i18n') {
    assert.ok(
      !config.plugins.some(name => /i18n-catalogs|paraglide/iu.test(name))
    )
    assert.ok(
      !config.tasks.includes('i18n-generate'),
      'Disabled i18n registered a generation task'
    )
    for (const file of modules) {
      assert.doesNotMatch(
        readFileSync(path.join(app, file), 'utf8'),
        /solid-runtime\/src\/theme\//u,
        'Disabled theme bundled runtime theme modules'
      )
      assert.doesNotMatch(
        readFileSync(path.join(app, file), 'utf8'),
        /solid-app:locale-request/u,
        'Locale requests require project.inlang/settings.json'
      )
      assert.doesNotMatch(
        readFileSync(path.join(app, file), 'utf8'),
        /paraglide|inlang/iu,
        'Disabled i18n bundled Paraglide or Inlang modules'
      )
    }
  }
  if (scenario === 'client-only') {
    assert.ok(
      !config.plugins.some((name: string) => /nitro/iu.test(name)),
      'Client-only loaded a Nitro plugin'
    )
    const html = readFileSync(path.join(app, 'dist/index.html'), 'utf8')
    const script = /src="(?<script>[^"]+\.js)"/u.exec(html)?.groups?.script
    assert.ok(script, 'Client HTML must load a script')
    assert.ok(existsSync(path.join(app, 'dist', script)))
    for (const directory of [
      'dist/server',
      'dist-ssr',
      '.nitro',
      '.output',
      '.vercel'
    ]) {
      assert.ok(
        !existsSync(path.join(app, directory)),
        `Client-only emitted ${directory}`
      )
    }
  }
}

test('the no-server guide shows the plugin of the scenario', () => {
  const guide = path.join(ROOT, 'docs/tooling/no-server.md')
  assertGuidePlugin(readFileSync(guide, 'utf8'))
})
test('the no-server server serves nothing outside dist', checkServerContainment)
test(
  'the no-server server closes when the browser does not launch',
  checkLaunchFailure
)
// A limit, so a handler that never answers fails instead of holding the run.
test(
  'the no-server server answers and closes when a request throws',
  { timeout: CHECK_TIMEOUT },
  checkHandlerFailure
)
test(
  'the no-server server closes when the browser does not close',
  { timeout: CHECK_TIMEOUT },
  checkBrowserCloseFailure
)
test(
  'the no-server profile folder is removed when the profile does not open',
  { timeout: CHECK_TIMEOUT },
  checkProfileFailure
)

test('the applications pin the versions of the workspace', () => {
  checkApplicationVersions({ root: ROOT, scenarios: SCENARIOS })
})
test('the packages require the Node version of the workspace', () => {
  checkPackageEngines(ROOT)
})

async function buildScenario({
  app,
  scenario,
  profile,
  deadline
}: {
  app: string
  scenario: string
  profile: string
  deadline: number
}): Promise<void> {
  mutateServerErrors({ app, scenario, mutation: MUTATION })
  instrumentMiddleware({ app, scenario, mutation: MUTATION })
  mutatePublication({ app, mutation: MUTATION })
  await run({ deadline, cwd: app, args: ['build'] })
  assertBuild({ app, scenario })
  assertFontBuild({ app, scenario })
  assertSeoBuild({ app, scenario })
  if (scenario === 'client-only') {
    // Runs after the audits of the default build, which must stay without a
    // theme; a mutation probe must fail on its own target.
    if (profile === 'isolated' && MUTATION === undefined) {
      await checkNoServer({ app, deadline, run, buildTools: BUILD_TOOLS })
    }
    return
  }
  await smoke({ app, scenario })
  if (scenario === 'ssr-plain' && profile === 'isolated') {
    await smoke({ app, scenario, hasInvalidPort: true })
    await checkEnvFailures({ app, deadline, run })
    await checkSeoOriginFailures({ app, deadline, run })
  }
  if (profile === 'isolated-meta-only') {
    await checkSeoOriginFailures({ app, deadline, run })
  }
  if (profile !== 'isolated') return
  importServerFromClient(app)
  await run({
    deadline,
    cwd: app,
    args: ['build'],
    expectedError: /Attempt to import 'server-only' in a client module/u
  })
}

for (const scenario of SCENARIOS) {
  for (const linker of [
    ...LINKERS,
    ...(scenario === 'client-only' ? [] : ['isolated-static']),
    ...(scenario === 'ssr-i18n' ? [] : ['isolated-language']),
    ...(scenario === 'ssr-plain'
      ? [
          'isolated-meta-only',
          'isolated-without-sitemap',
          ...PUBLICATION_PROFILES
        ]
      : [])
  ]) {
    test(`${scenario} / ${linker}`, { timeout: 180_000 }, async () => {
      const directory = mkdtempSync(path.join(tmpdir(), 'solid-app-scenario-'))
      const started = performance.now()
      const deadline = Date.now() + SCENARIO_TIMEOUT
      try {
        const { dependencies, overrides } = await packWorkspace({
          directory,
          deadline
        })
        const app = path.join(directory, 'app')
        prepareFontsScenario({ app, scenario, root: ROOT })
        prepareSeoScenario({
          app,
          scenario,
          profile: linker,
          mutation: MUTATION
        })
        const manifestPath = path.join(app, 'package.json')
        const manifest = v.parse(
          manifestSchema,
          JSON.parse(readFileSync(manifestPath, 'utf8'))
        )
        manifest.overrides = { ...manifest.overrides, ...overrides }
        writeFileSync(
          manifestPath,
          JSON.stringify({
            ...manifest,
            dependencies: { ...manifest.dependencies, ...dependencies }
          })
        )
        if (
          MUTATION === 'locale-provider' ||
          MUTATION === 'navigation-provider'
        ) {
          const source = readPinned(
            path.join(ROOT, 'apps/boilerplate/package.json')
          )
          manifest.dependencies['@inlang/paraglide-js'] =
            source.dependencies['@inlang/paraglide-js'] ?? ''
          writeFileSync(
            manifestPath,
            JSON.stringify({
              ...manifest,
              dependencies: { ...manifest.dependencies, ...dependencies }
            })
          )
        }
        if (MUTATION === 'nitro') {
          const source = readFileSync(
            path.join(ROOT, 'packages/solid-tooling/package.json'),
            'utf8'
          )
          const tooling = v.parse(manifestSchema, JSON.parse(source))
          manifest.dependencies.nitro = tooling.dependencies.nitro ?? ''
          writeFileSync(
            manifestPath,
            JSON.stringify({
              ...manifest,
              dependencies: { ...manifest.dependencies, ...dependencies }
            })
          )
        }
        if (linker === 'isolated-language') {
          const language = scenario === 'client-only' ? 'zh-Hant-TW' : 'de'
          const config = path.join(app, 'vite.config.ts')
          writeFileSync(
            config,
            readFileSync(config, 'utf8').replace(
              'root: import.meta.dirname,',
              `root: import.meta.dirname, language: '${language}',`
            )
          )
          for (const name of [
            'probe.locale.node.test.ts',
            'probe.locale.dom.test.ts',
            ...(scenario === 'client-only'
              ? ['probe.navigation.dom.test.tsx']
              : [])
          ]) {
            const file = path.join(app, 'src/helpers/probe/__tests__', name)
            writeFileSync(
              file,
              readFileSync(file, 'utf8').replaceAll("'en'", `'${language}'`)
            )
          }
        }
        await run({
          deadline,
          cwd: app,
          args: [
            'install',
            '--linker',
            linker.startsWith('isolated-') ? 'isolated' : linker
          ]
        })
        await checkDiagnostics({ app, deadline })
        mutateLocaleStandIn({ app, mutation: MUTATION })
        if (scenario === 'ssr-i18n') {
          // Keep the shared fixture App unchanged while adopting the catalog ID convention.
          const entry = path.join(app, 'src/App.tsx')
          const source = readFileSync(entry, 'utf8')
          assert.ok(source.includes('m.greeting()'))
          writeFileSync(
            entry,
            source.replace('m.greeting()', 'm.scenario_greeting()')
          )
          await run({ deadline, cwd: app, args: ['run', 'i18n-generate'] })
        }
        if (MUTATION === 'dom') {
          const file = path.join(app, 'vite.config.ts')
          writeFileSync(
            file,
            readFileSync(file, 'utf8').replace(
              'root: import.meta.dirname,',
              "root: import.meta.dirname, test: { domUrl: 'http://localhost/broken' },"
            )
          )
        }
        if (MUTATION === 'headers') {
          const file = path.join(app, 'src/middleware.ts')
          writeFileSync(
            file,
            readFileSync(file, 'utf8').replace(
              'createSecurityHeaders()',
              "createSecurityHeaders({ headers: { 'x-content-type-options': 'broken' } })"
            )
          )
        }
        if (linker === 'isolated-static') {
          await checkStaticOutput({
            app,
            deadline,
            isTranslated: scenario === 'ssr-i18n'
          })
          return
        }
        const envChecks = await prepareEnvScenario({
          app,
          scenario,
          deadline,
          dependencies: manifest.dependencies,
          run
        })
        // The tests load the plugins of the preset first, so the
        // missing-dependency probe fails there.
        await run({
          deadline,
          cwd: app,
          args: ['test', 'run', '--project', 'node', '--project', 'dom']
        })
        await regenerateIconTypes({ app, deadline })
        await run({
          deadline,
          cwd: app,
          args: ['lint', 'src', 'vite.config.ts', ...envChecks.lintFiles]
        })
        await run({
          deadline,
          cwd: app,
          args: ['run', 'tsrs', '--noEmit', ...envChecks.typecheckFlags]
        })
        instrument({ app, mutation: MUTATION, root: ROOT })
        if (MUTATION === 'request-step') {
          writeFileSync(
            path.join(app, 'src/middleware.ts'),
            `import { createSecurityHeaders } from '@evertondgn/solid-runtime/middleware/security-headers'
const { securityHeaders } = createSecurityHeaders()
export default (event, next) => securityHeaders(event.request, next)
`
          )
        }
        if (MUTATION === 'request-plain') {
          writeFileSync(
            path.join(app, 'src/middleware.ts'),
            `import { createLocalizeRequest } from '@evertondgn/solid-runtime/middleware/localize-request'
const localize = createLocalizeRequest({ applySecurityHeaders: response => response })
await localize({ request: new Request('https://example.com/'), next: async () => new Response() })
export default (event, next) => next()
`
          )
        }
        if (MUTATION === 'nitro') {
          const file = path.join(app, 'vite.config.ts')
          writeFileSync(
            file,
            `import { nitro } from 'nitro/vite'\n${readFileSync(file, 'utf8').replace('plugins: [...(config.plugins ?? []), audit]', "plugins: [...(config.plugins ?? []), audit, nitro({ preset: 'vercel' })]")}`
          )
        }
        mutateTheme({ app, mutation: MUTATION })
        mutateFontsScenario({ app, scenario, mutation: MUTATION })
        await buildScenario({ app, scenario, profile: linker, deadline })
      } finally {
        rmSync(directory, { recursive: true, force: true })
        stdout.write(
          `${scenario} / ${linker}: ${Math.round(performance.now() - started)} ms including cleanup\n`
        )
      }
    })
  }
}
