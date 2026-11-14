/* oxlint-disable node/no-sync -- The test owns each temporary application and inspects artifacts between awaited commands. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  cpSync,
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
import { env, kill, stdout } from 'node:process'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'

import * as v from 'valibot'

const ROOT = path.resolve(import.meta.dirname, '../../../../..')
const VP = path.join(ROOT, 'node_modules/.bin/vp')
const SCENARIOS = ['client-only', 'ssr-plain', 'ssr-i18n']
const LINKERS = ['hoisted', 'isolated']
const COMMAND_TIMEOUT = 60_000
const SCENARIO_TIMEOUT = 150_000
const PREVIEW_TIMEOUT = 15_000
const REQUEST_TIMEOUT = 1000
const POLL_INTERVAL = 100
const HTTP_OK = 200
const HTTP_TEMPORARY_REDIRECT = 307
const PACKAGED_TOOLS = [
  '@playwright/test',
  '@solidjs/vite-plugin',
  'filesystem-routing',
  'knip',
  'nitro',
  'unplugin-icons',
  '@commitlint/cli',
  'lefthook',
  'happy-dom',
  'playwright',
  '@vitest/browser-playwright',
  '@vitest/coverage-v8',
  '@vitest/ui',
  '@testing-library/jest-dom',
  '@types/node',
  'typescript'
]
// Nitro and routing have runtime entries; their build adapters must stay out.
const BUILD_TOOLS =
  /\/node_modules\/(?:@evertondgn\/solid-tooling\/|@commitlint\/|@vitest\/|@testing-library\/|@playwright\/|@inlang\/sdk\/|(?:knip|typescript|happy-dom|playwright|playwright-core|lefthook|unplugin-icons|eslint-plugin-solid|stylelint|stylelint-use-nesting)\/|nitro\/dist\/(?:builder|vite|cli|presets\/[^/]+\/(?!runtime\/))|filesystem-routing\/dist\/(?:index|vite)|@solidjs\/vite-plugin\/dist\/esm\/index)/u
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
const manifestSchema = v.looseObject({
  dependencies: v.record(v.string(), v.string())
})
const versionsSchema = v.optional(v.record(v.string(), v.string()), {})
const pinnedSchema = v.looseObject({
  catalog: versionsSchema,
  overrides: versionsSchema,
  dependencies: versionsSchema,
  devDependencies: versionsSchema,
  engines: v.optional(v.unknown()),
  devEngines: v.optional(v.unknown()),
  packageManager: v.optional(v.string())
})
const MUTATION = env.SCENARIO_MUTATION

type Command = { cwd: string; args: string[]; deadline: number; file?: string }
type Target = { app: string; scenario: string }
type Pinned = v.InferOutput<typeof pinnedSchema>
type CatalogInput = {
  versions: Record<string, string>
  catalog: Pinned['catalog']
}
type Versions = Record<string, string | undefined>

async function run({
  cwd,
  args,
  deadline,
  file: executable
}: Command): Promise<string> {
  let file = executable ?? path.join(cwd, 'node_modules/.bin/vp')
  if (!executable && args[0] === 'install') file = 'bun'
  if (!executable && args[0] === 'pm') file = VP
  const started = performance.now()
  assert.ok(Date.now() < deadline, 'Scenario execution deadline exceeded')
  const child = spawn(file, args, {
    cwd,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let output = ''
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    output += chunk
  })
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    output += chunk
  })
  const timer = setTimeout(
    () => {
      if (child.pid) kill(-child.pid, 'SIGKILL')
    },
    Math.min(COMMAND_TIMEOUT, deadline - Date.now())
  )
  try {
    const result: unknown[] = await once(child, 'close')
    const [code] = result
    stdout.write(
      `${args.join(' ')}: ${Math.round(performance.now() - started)} ms\n`
    )
    assert.equal(code, 0, `${args.join(' ')}\n${output}`)
    return output
  } finally {
    clearTimeout(timer)
  }
}

type PackedMutation = { archive: string; deadline: number; name: string }

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
  assert.ok(manifest.dependencies['unplugin-icons'])
  delete manifest.dependencies['unplugin-icons']
  writeFileSync(file, JSON.stringify(manifest))
  await run({
    deadline,
    cwd: unpacked,
    file: 'tar',
    args: ['-czf', archive, 'package']
  })
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

type ThemeSmoke = { html: string; response: Response; origin: string }

async function smokeTheme({
  html,
  response,
  origin
}: ThemeSmoke): Promise<void> {
  const themeScriptTag =
    /<script(?<attributes>[^>]*)>[^<]*prefers-color-scheme/u.exec(html)
  assert.ok(themeScriptTag, 'Theme script must exist')
  const nonce = /nonce="(?<value>[^"]+)"/u.exec(
    themeScriptTag.groups?.attributes ?? ''
  )?.groups?.value
  assert.ok(nonce, 'Theme script must carry a nonce')
  assert.ok(
    response.headers
      .get('content-security-policy')
      ?.includes(`'nonce-${nonce}'`),
    'Theme nonce must match CSP'
  )
  const rootTag = /<html[^>]*>/u.exec(html)?.[0] ?? ''
  assert.doesNotMatch(
    rootTag,
    /class="[^"]*\b(?:light|dark)\b/u,
    'System theme must not emit an SSR theme class'
  )
  const dark = await fetch(`${origin}/fr`, {
    headers: { cookie: 'scenario-theme=dark' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT)
  })
  assert.equal(dark.status, HTTP_OK)
  const darkHtml = await dark.text()
  assert.match(
    darkHtml,
    /<html[^>]*class="dark"/u,
    'Cookie must set dark class'
  )
  assert.ok(
    darkHtml.includes(
      `name="theme-color" content="${MUTATION === 'theme-color' ? '#wrong' : '#09090b'}"`
    ),
    'Dark theme-color must match configuration'
  )
}

async function smoke({ app, scenario }: Target): Promise<void> {
  const port = await freePort()
  const child = spawn(
    path.join(app, 'node_modules/.bin/vp'),
    ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: app, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }
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
    assert.equal(response.status, HTTP_OK)
    const html = await response.text()
    assert.match(html, /<main[^>]*>Scenario application<\/main>/u)
    if (scenario === 'ssr-i18n') {
      assert.match(
        html,
        MUTATION === 'locale-tag'
          ? /<html[^>]* lang="ja-JP"/u
          : /<html[^>]* lang="fr-FR"/u,
        'Runtime localeTag must set the document language tag'
      )
      const origin = `http://127.0.0.1:${port}`
      await smokeTheme({ html, response, origin })
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
  } finally {
    if (child.pid && child.exitCode === null) {
      kill(-child.pid, 'SIGKILL')
    }
    await closed
  }
}

function mutateTheme(app: string): void {
  if (MUTATION === 'theme-import') {
    const file = path.join(app, 'src/App.tsx')
    writeFileSync(
      file,
      `import { isTheme } from '@evertondgn/solid-runtime/theme/is-theme'\n${readFileSync(file, 'utf8').replace('<main', "<main data-theme={isTheme('dark')}")}`
    )
  }
  if (MUTATION === 'theme-nonce') {
    const file = path.join(app, 'src/App.tsx')
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace('<script nonce={nonce}>', '<script>')
    )
  }
}

function mutateLocaleStandIn(app: string): void {
  if (MUTATION === 'locale-node' || MUTATION === 'locale-setter') {
    const dist = path.join(app, 'node_modules/@evertondgn/solid-tooling/dist')
    let replacements = 0
    for (const name of readdirSync(dist).filter(entry =>
      entry.endsWith('.mjs')
    )) {
      const file = path.join(dist, name)
      const source = readFileSync(file, 'utf8')
      const changed =
        MUTATION === 'locale-setter'
          ? source.replace('export const setLocale = () => undefined', '')
          : source.replace(
              '[...NODE_STUBS, ["virtual:solid-app/locale", source]]',
              'NODE_STUBS'
            )
      if (source !== changed) {
        replacements += 1
        writeFileSync(file, changed)
      }
    }
    assert.equal(
      replacements,
      1,
      MUTATION === 'locale-setter'
        ? 'Remove exactly one single-language setLocale export'
        : 'Remove exactly one node locale stand-in'
    )
  }
}

function instrument(app: string): void {
  if (MUTATION === 'tool-bundle') {
    const entry = path.join(app, 'src/App.tsx')
    writeFileSync(
      entry,
      `import { fmt } from '@evertondgn/solid-tooling/fmt'\nglobalThis.__scenarioTool = fmt\n${readFileSync(entry, 'utf8')}`
    )
  }
  // Observes the resolved plugins and bundled module IDs without replacing the preset.
  writeFileSync(
    path.join(app, 'scenario-audit.ts'),
    `import { writeFileSync } from 'node:fs'
export const audit = {
  name: 'scenario-audit',
  configResolved(config) {
    writeFileSync('scenario-config.json', JSON.stringify({plugins: config.plugins.map(p => p.name), tasks: Object.keys(config.run?.tasks ?? {})}))
  },
  generateBundle() {
    writeFileSync('scenario-modules-' + this.environment.name + '.json', JSON.stringify([...this.getModuleIds()]))
  }
}
`
  )
  if (MUTATION === 'navigation-provider') {
    const generated = path.join(app, 'paraglide')
    cpSync(
      path.join(ROOT, 'packages/solid-runtime/tooling/testing/generated'),
      generated,
      { recursive: true }
    )
    const entry = path.join(
      app,
      'node_modules/@evertondgn/solid-runtime/src/i18n/createLocalizedNavigate/index.ts'
    )
    const runtime = JSON.stringify(path.join(generated, 'runtime.js'))
    writeFileSync(
      entry,
      readFileSync(entry, 'utf8').replace("'../locale/index.ts'", runtime)
    )
  }
  if (MUTATION === 'locale-provider') {
    const generated = path.join(app, 'paraglide')
    cpSync(path.join(ROOT, 'apps/boilerplate/paraglide'), generated, {
      recursive: true
    })
    const auditFile = path.join(app, 'scenario-audit.ts')
    const runtime = JSON.stringify(path.join(generated, 'runtime.js'))
    writeFileSync(
      auditFile,
      readFileSync(auditFile, 'utf8').replace(
        "name: 'scenario-audit',",
        `name: 'scenario-audit', enforce: 'pre',
      resolveId(id) { if (id === 'virtual:solid-app/locale') return '\\0solid-app:locale-mutant' },
      load(id) { if (id === '\\0solid-app:locale-mutant') return 'export { locales, baseLocale, getLocale, extractLocaleFromUrl, localizeHref, deLocalizeUrl } from ' + ${JSON.stringify(runtime)} },`
      )
    )
  }
  const file = path.join(app, 'vite.config.ts')
  let config = readFileSync(file, 'utf8').replace(
    'export default defineSolidApp(',
    'const application = defineSolidApp('
  )
  config = `import { defineConfig } from 'vite-plus'\nimport { audit } from './scenario-audit.ts'\n${config}\nexport default defineConfig(env => { const config = application(env); return {...config, plugins: [...(config.plugins ?? []), audit]} })\n`
  writeFileSync(file, config)
}

function assertBuild({ app, scenario }: Target): void {
  const source = readFileSync(path.join(app, 'scenario-config.json'), 'utf8')
  const config = v.parse(configSchema, JSON.parse(source))
  const modules = readdirSync(app).filter(file =>
    file.startsWith('scenario-modules-')
  )
  assert.ok(modules.length > 0, 'Build module audit must run')
  for (const file of modules) {
    const content = readFileSync(path.join(app, file), 'utf8')
    const ids = v.parse(v.array(v.string()), JSON.parse(content))
    for (const id of ids) {
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

function readPinned(file: string): Pinned {
  return v.parse(pinnedSchema, JSON.parse(readFileSync(file, 'utf8')))
}

function resolveCatalog({ versions, catalog }: CatalogInput): Versions {
  return Object.fromEntries(
    Object.entries(versions).map(([name, version]) => [
      name,
      version === 'catalog:' ? catalog[name] : version
    ])
  )
}

// The applications sit outside the workspace, where catalog: does not
// resolve, so they pin each version. Without this check an update of the
// workspace would leave the matrix testing the old versions.
test('the applications pin the versions of the workspace', () => {
  const workspace = readPinned(path.join(ROOT, 'package.json'))
  const copy = readPinned(path.join(ROOT, 'apps/boilerplate/package.json'))
  const { catalog } = workspace
  const tooling = readPinned(
    path.join(ROOT, 'packages/solid-tooling/package.json')
  )
  for (const name of PACKAGED_TOOLS) {
    assert.ok(tooling.dependencies[name], `${name} must ship with the tooling`)
  }
  const expected = resolveCatalog({
    versions: { ...catalog, ...copy.dependencies, ...copy.devDependencies },
    catalog
  })
  const overrides = resolveCatalog({ versions: workspace.overrides, catalog })
  for (const scenario of SCENARIOS) {
    const app = readPinned(
      path.join(ROOT, 'fixtures/apps', scenario, 'package.json')
    )
    for (const [name, version] of Object.entries(app.dependencies)) {
      assert.equal(version, expected[name], `${scenario}: ${name}`)
      assert.ok(
        !PACKAGED_TOOLS.includes(name),
        `${scenario} must use the packaged ${name}`
      )
    }
    assert.deepEqual(app.overrides, overrides, scenario)
    assert.deepEqual(app.engines, workspace.engines, scenario)
    assert.deepEqual(app.devEngines, workspace.devEngines, scenario)
    assert.equal(app.packageManager, workspace.packageManager, scenario)
  }
})

for (const scenario of SCENARIOS) {
  for (const linker of [
    ...LINKERS,
    ...(scenario === 'ssr-i18n' ? [] : ['isolated-language'])
  ]) {
    test(`${scenario} / ${linker}`, { timeout: 180_000 }, async () => {
      const directory = mkdtempSync(path.join(tmpdir(), 'solid-app-scenario-'))
      const started = performance.now()
      const deadline = Date.now() + SCENARIO_TIMEOUT
      try {
        const dependencies: Record<string, string> = {}
        for (const name of ['solid-tooling', 'solid-runtime']) {
          const destination = path.join(directory, name)
          await run({
            deadline,
            cwd: path.join(ROOT, 'packages', name),
            args: ['pm', 'pack', '--pack-destination', destination]
          })
          const tarball = readdirSync(destination).find(file =>
            file.endsWith('.tgz')
          )
          assert.ok(tarball)
          await removePackedDependency({
            archive: path.join(destination, tarball),
            deadline,
            name
          })
          dependencies[`@evertondgn/${name}`] = path.join(destination, tarball)
        }
        const app = path.join(directory, 'app')
        cpSync(path.join(ROOT, 'fixtures/apps', scenario), app, {
          recursive: true
        })
        const manifestPath = path.join(app, 'package.json')
        const manifest = v.parse(
          manifestSchema,
          JSON.parse(readFileSync(manifestPath, 'utf8'))
        )
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
            linker === 'isolated-language' ? 'isolated' : linker
          ]
        })
        mutateLocaleStandIn(app)
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
        await run({
          deadline,
          cwd: app,
          args: ['lint', 'src', 'vite.config.ts']
        })
        await run({ deadline, cwd: app, args: ['run', 'tsc', '--noEmit'] })
        await run({
          deadline,
          cwd: app,
          args: ['test', 'run', '--project', 'node', '--project', 'dom']
        })
        instrument(app)
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
        mutateTheme(app)
        await run({ deadline, cwd: app, args: ['build'] })
        assertBuild({ app, scenario })
        if (scenario !== 'client-only') await smoke({ app, scenario })
      } finally {
        rmSync(directory, { recursive: true, force: true })
        stdout.write(
          `${scenario} / ${linker}: ${Math.round(performance.now() - started)} ms including cleanup\n`
        )
      }
    })
  }
}
