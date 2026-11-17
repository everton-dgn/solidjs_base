/* oxlint-disable node/no-sync -- The scenario owns the temporary application and inspects each completed build. */
import assert from 'node:assert/strict'
import { once } from 'node:events'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from 'node:http'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { env, stdout } from 'node:process'
import { mock } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

import {
  chromium,
  type Browser,
  type BrowserContext,
  type LaunchOptions,
  type Page
} from 'playwright'

import type { run as runCommand } from './scenario-process.ts'

type Run = typeof runCommand
type NoServerInput = {
  app: string
  deadline: number
  run: Run
  buildTools: RegExp
}
type BuildInput = NoServerInput & { base: string; assetsDir: string }
type Opened = { page: Page; fonts: string[] }
type Exercise = Opened & { canReusePreload: boolean }
type StaticServer = {
  origin: string
  // The first error of the request handler, which the scenario must report.
  failure: () => Failure | undefined
  close: () => Promise<void>
}
type Read = (file: string) => Buffer
type Failure = { error: unknown }

// The base of the GitHub Pages project sites; the host serves the build there.
const SUBFOLDER = '/meu-repo/'
const STORAGE_KEY = 'scenario-theme'
// The default of Playwright for every action.
const BROWSER_TIMEOUT = 30_000
const PROFILE_POLL_INTERVAL = 50
const DEFAULT_ASSETS_DIR = 'assets'
// A second folder proves that the plugin of the guide reads build.assetsDir.
const OTHER_ASSETS_DIR = 'static'
const LIGHT_COLOR = '#ffffff'
const DARK_COLOR = '#09090b'
// Differs from both theme colors, so only a theme script can replace it.
const INITIAL_COLOR = '#123456'
const THEME_COLOR_META = `<meta name="theme-color" content="${INITIAL_COLOR}" />`
const HTTP_NOT_FOUND = 404
const HTTP_OK = 200
const HTTP_SERVER_ERROR = 500
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2'
}
// The CI has Chrome and no downloaded Chromium, as the preset assumes.
const CHANNEL = env.CI ? 'chrome' : undefined
// A shell such as Electron loads modules from file://; a plain browser blocks
// them unless this flag is set.
const FILE_ACCESS = '--allow-file-access-from-files'

// A test keeps it equal to the plugin in docs/tooling/no-server.md.
const STORED_THEME_PLUGIN = `// Applies the stored theme before the first paint, from a classic script that
// needs no nonce and runs from file://.
const HASH_LENGTH = 8

function storedTheme(): Plugin {
  const source = storedThemeScript(themeOptions)
  const hash = createHash('sha256')
    .update(source)
    .digest('hex')
    .slice(0, HASH_LENGTH)
  let fileName = ''
  let base = '/'
  return {
    name: 'app:stored-theme',
    configResolved(config) {
      ;({ base } = config)
      fileName = path.posix.join(config.build.assetsDir, \`theme-\${hash}.js\`)
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName, source })
    },
    transformIndexHtml: (_html, context) => [
      context.server
        ? { tag: 'script', children: source, injectTo: 'head-prepend' }
        : {
            tag: 'script',
            attrs: { src: \`\${base}\${fileName}\` },
            injectTo: 'head-prepend'
          }
    ]
  }
}`

const THEME_OPTIONS = `import type { LocalStorageThemeOptions } from '@evertondgn/solid-runtime/theme/types'

export const themeOptions: LocalStorageThemeOptions = {
  storage: 'local-storage',
  storageKey: '${STORAGE_KEY}',
  colors: { light: '${LIGHT_COLOR}', dark: '${DARK_COLOR}' },
  defaultTheme: 'light'
}
`

const NO_SERVER_CONFIG = `import { createHash } from 'node:crypto'
import path from 'node:path'

import { storedThemeScript } from '@evertondgn/solid-runtime/theme/stored-theme-script'
import { defineSolidApp } from '@evertondgn/solid-tooling/vite'
import type { Plugin } from 'vite-plus'

import { themeOptions } from './src/theme-options.ts'

${STORED_THEME_PLUGIN}

export default defineSolidApp({
  root: import.meta.dirname,
  icons: { scenario: './src/assets/icons' },
  fonts: [
    {
      family: 'Scenario Font',
      files: [
        {
          path: 'src/assets/scenario.woff2',
          weight: 400,
          unicodeRange: 'U+0041',
          preload: true
        }
      ]
    }
  ],
  ssr: false,
  extend: () => ({ plugins: [storedTheme()] })
})
`

// The same wrapping as instrument, which the default build already used.
function auditedConfig(config: string): string {
  const application = config.replace(
    'export default defineSolidApp(',
    'const application = defineSolidApp('
  )
  assert.notEqual(application, config)
  return `import { defineConfig } from 'vite-plus'
import { audit } from './scenario-audit.ts'
${application}
export default defineConfig(env => { const config = application(env); return {...config, plugins: [...(config.plugins ?? []), audit]} })
`
}

const ENTRY = `import { createRouter, hashHistory } from '@solidjs/router'
import { render } from '@solidjs/web'

import App from './App.tsx'
import { ThemeToggle } from './theme-toggle.tsx'

const Router = createRouter({
  routes: [{ path: '*all', component: App }],
  history: hashHistory()
})

render(
  () => (
    <>
      <ThemeToggle />
      <Router>{props => props.children}</Router>
    </>
  ),
  document.body
)
`

const TOGGLE = `import { defineTheme } from '@evertondgn/solid-runtime/theme/define-theme'

import { themeOptions } from './theme-options.ts'

const { createTheme } = defineTheme(themeOptions)

export function ThemeToggle() {
  const theme = createTheme()
  return (
    <button type="button" onClick={() => theme.setTheme('dark')}>
      Dark
    </button>
  )
}
`

// The installed client-only application, rewritten for a host with no server:
// hash routing, the theme in localStorage and its script in index.html, which
// also gets a theme-color meta after the place of that script.
function writeNoServerApp(app: string): void {
  const index = path.join(app, 'index.html')
  const html = readFileSync(index, 'utf8')
  const withMeta = html.replace('<title>', `${THEME_COLOR_META}\n    <title>`)
  assert.notEqual(withMeta, html, 'The copy must have a title in its head')
  writeFileSync(index, withMeta)
  writeFileSync(path.join(app, 'vite.config.ts'), NO_SERVER_CONFIG)
  writeFileSync(path.join(app, 'src/theme-options.ts'), THEME_OPTIONS)
  writeFileSync(path.join(app, 'src/theme-toggle.tsx'), TOGGLE)
  writeFileSync(path.join(app, 'src/entry-client.tsx'), ENTRY)
}

function readModules(app: string): string[] {
  return readdirSync(app)
    .filter(file => file.startsWith('scenario-modules-'))
    .flatMap(file => {
      const ids: unknown = JSON.parse(
        readFileSync(path.join(app, file), 'utf8')
      )
      assert.ok(Array.isArray(ids))
      return ids.map(String)
    })
}

async function buildFor({
  app,
  deadline,
  run,
  buildTools,
  base,
  assetsDir
}: BuildInput): Promise<string> {
  rmSync(path.join(app, 'dist'), { recursive: true, force: true })
  await run({
    deadline,
    cwd: app,
    args: ['build', '--base', base, '--assetsDir', assetsDir]
  })
  const ids = readModules(app)
  assert.ok(
    ids.some(id => /solid-runtime\/src\/theme\//u.test(id)),
    'The no-server build must bundle the runtime theme'
  )
  for (const id of ids) {
    assert.doesNotMatch(id, buildTools, 'Build bundled a development tool')
  }
  const html = readFileSync(path.join(app, 'dist/index.html'), 'utf8')
  const theme =
    /<script src="(?<src>[^"]*theme-[\da-f]+\.js)"><\/script>/u.exec(html)
      ?.groups?.src
  assert.ok(theme, `The build must load the theme script: ${html}`)
  assert.ok(theme.startsWith(`${base}${assetsDir}/`), theme)
  const file = path.join(app, 'dist', theme.slice(base.length))
  assert.ok(existsSync(file), file)
  assert.ok(
    html.indexOf(theme) < html.indexOf('type="module"'),
    'The theme script must run before the application module'
  )
  // The order the guide produces: the script cannot see the meta yet.
  assert.ok(
    html.indexOf(theme) < html.indexOf('name="theme-color"'),
    'The theme script must run before the parser reaches the meta'
  )
  return html
}

function entryScript(html: string): string {
  const entry = /<script type="module"[^>]*src="(?<src>[^"]+)"/u.exec(html)
    ?.groups?.src
  assert.ok(entry, html)
  return entry
}

function isFileInside(root: string, file: string): boolean {
  const relative = path.relative(root, file)
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative) &&
    existsSync(file) &&
    statSync(file).isFile()
  )
}

function respond({
  root,
  read,
  request,
  response
}: {
  root: string
  read: Read
  request: IncomingMessage
  response: ServerResponse
}): void {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost')
  const relative = pathname.startsWith(SUBFOLDER)
    ? pathname.slice(SUBFOLDER.length) || 'index.html'
    : undefined
  const file = relative ? path.resolve(root, relative) : undefined
  if (!file || !isFileInside(root, file)) {
    response.writeHead(HTTP_NOT_FOUND).end()
    return
  }
  const body = read(file)
  response.writeHead(HTTP_OK, {
    'content-type': CONTENT_TYPES[path.extname(file)] ?? 'text/plain'
  })
  response.end(body)
}

// Serves only the files of dist under SUBFOLDER; anything else is not found.
async function serve(dist: string, read: Read): Promise<StaticServer> {
  const root = path.resolve(dist)
  let failure: Failure | undefined
  // WHY: an error thrown in the handler is uncaught and ends the process
  // before any finally closes the browser and removes the folders.
  const server = createServer((request, response) => {
    try {
      respond({ root, read, request, response })
    } catch (error) {
      failure ??= { error }
      if (!response.headersSent) response.writeHead(HTTP_SERVER_ERROR)
      response.end()
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address !== null && typeof address === 'object')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    failure: () => failure,
    close: async () => {
      const closed = once(server, 'close')
      server.close()
      // A keep-alive connection of a browser that did not close holds close.
      server.closeAllConnections()
      await closed
    }
  }
}

async function withServer<T>(
  { dist, read = readFileSync }: { dist: string; read?: Read },
  use: (origin: string) => Promise<T>
): Promise<T> {
  const server = await serve(dist, read)
  try {
    // WHY: use settles first, so the browser it opened is closed before the
    // error of a request replaces the one it caused.
    const [result] = await Promise.allSettled([use(server.origin)])
    const failure = server.failure()
    if (failure) throw failure.error
    if (result.status === 'rejected') throw result.reason
    return result.value
  } finally {
    await server.close()
  }
}

async function withBrowser<T>(
  options: LaunchOptions,
  use: (browser: Browser) => Promise<T>
): Promise<T> {
  const browser = await chromium.launch(options)
  try {
    return await use(browser)
  } finally {
    await browser.close()
  }
}

async function open(context: BrowserContext, url: string): Promise<Opened> {
  const page = await context.newPage()
  page.setDefaultTimeout(BROWSER_TIMEOUT)
  const fonts: string[] = []
  page.on('request', request => {
    if (request.url().endsWith('.woff2')) fonts.push(request.url())
  })
  await page.goto(url)
  await page.getByText('Scenario application').waitFor()
  return { page, fonts }
}

// The app mounts, loads its font from the relative or subfolder URL, keeps the
// route in the hash across a reload and saves the theme choice.
async function exercise({
  page,
  fonts,
  canReusePreload
}: Exercise): Promise<void> {
  // A string runs in the page; the tooling types have no DOM library. The
  // timer gives the font its own limit, which evaluate does not have.
  const loaded: unknown = await page.evaluate(
    `Promise.race([
      document.fonts.load('16px "Scenario Font"', 'A').then(faces => faces.map(face => face.status)),
      new Promise((_, reject) => setTimeout(() => reject(new Error('The font did not load in ${BROWSER_TIMEOUT} ms')), ${BROWSER_TIMEOUT}))
    ])`
  )
  assert.deepEqual(loaded, ['loaded'], 'The packaged font must load')
  assert.deepEqual(
    [...new Set(fonts)],
    fonts.slice(0, 1),
    `The stylesheet and the preload must name one file: ${fonts.join(', ')}`
  )
  // Chromium reads the file again under file://, where the request of the
  // stylesheet does not match the preload; over HTTP it must reuse it.
  if (canReusePreload) assert.equal(fonts.length, 1, 'The preload was unused')
  await page.getByRole('button', { name: 'About' }).click()
  const output = page.locator('output')
  await output.filter({ hasText: '/about?q=1' }).waitFor()
  const route = await output.textContent()
  assert.match(page.url(), /#\/about\?q=1/u)
  await page.reload()
  await output.filter({ hasText: '/about?q=1' }).waitFor()
  assert.equal(await output.textContent(), route)
  await page.getByRole('button', { name: 'Dark' }).click()
  await page.locator('html.dark').waitFor({ state: 'attached' })
  const stored: unknown = await page.evaluate(
    `localStorage.getItem(${JSON.stringify(STORAGE_KEY)})`
  )
  assert.equal(stored, 'dark')
}

// Without the application module, only the classic theme script can set the
// theme, so this proves the stored choice is applied before the first paint.
async function openWithoutModule(
  context: BrowserContext,
  { url, html }: { url: string; html: string }
): Promise<void> {
  const page = await context.newPage()
  page.setDefaultTimeout(BROWSER_TIMEOUT)
  const entry = new URL(entryScript(html), url).href
  let blocked = 0
  await page.route(entry, async route => {
    blocked += 1
    await route.abort()
  })
  await page.goto(url)
  await page.locator('html.dark').waitFor({ state: 'attached' })
  assert.equal(blocked, 1, `The entry module must be blocked: ${entry}`)
  assert.equal(await page.locator('main').count(), 0)
  const applied: unknown = await page.evaluate(
    `({ colorScheme: document.documentElement.style.colorScheme, themeColor: document.querySelector('meta[name="theme-color"]')?.content })`
  )
  assert.deepEqual(applied, { colorScheme: 'dark', themeColor: DARK_COLOR })
  await page.close()
}

async function checkSubfolder(input: NoServerInput): Promise<void> {
  const html = await buildFor({
    ...input,
    base: SUBFOLDER,
    assetsDir: DEFAULT_ASSETS_DIR
  })
  await withServer({ dist: path.join(input.app, 'dist') }, origin =>
    withBrowser({ channel: CHANNEL }, async browser => {
      const context = await browser.newContext()
      const url = `${origin}${SUBFOLDER}`
      const first = await open(context, url)
      assert.ok(
        first.fonts[0]?.startsWith(`${url}${DEFAULT_ASSETS_DIR}/`),
        `The font must load from the subfolder: ${first.fonts.join(', ')}`
      )
      await exercise({ ...first, canReusePreload: true })
      await first.page.close()
      await openWithoutModule(context, { url, html })
    })
  )
}

async function withProfile<T>(
  profile: string,
  use: (context: BrowserContext) => Promise<T>
): Promise<T> {
  const context = await chromium.launchPersistentContext(profile, {
    channel: CHANNEL,
    args: [FILE_ACCESS]
  })
  try {
    return await use(context)
  } finally {
    await context.close()
  }
}

function hasRecord(folder: string, record: Buffer): boolean {
  return (
    existsSync(folder) &&
    readdirSync(folder).some(file =>
      readFileSync(path.join(folder, file)).includes(record)
    )
  )
}

// WHY: Chromium writes localStorage to the profile about 5 s after a change,
// or at once when the last page of the origin closes. A browser that quits
// before the write loses the theme, and the next launch fails on that race
// instead of on the classic script.
async function saveStoredTheme({
  page,
  profile
}: {
  page: Page
  profile: string
}): Promise<void> {
  await page.close()
  // The LevelDB record of the key: the length of the value, then the value
  // behind the marker of a Latin-1 string.
  const value = '\u0001dark'
  const record = Buffer.from(
    `${STORAGE_KEY}${String.fromCodePoint(value.length)}${value}`,
    'latin1'
  )
  const folder = path.join(profile, 'Default/Local Storage/leveldb')
  const deadline = Date.now() + BROWSER_TIMEOUT
  while (!hasRecord(folder, record)) {
    assert.ok(
      Date.now() < deadline,
      `The profile did not save the theme in ${BROWSER_TIMEOUT} ms`
    )
    await delay(PROFILE_POLL_INTERVAL)
  }
}

async function withProfileFolder<T>(
  use: (profile: string) => Promise<T>
): Promise<T> {
  const profile = mkdtempSync(path.join(tmpdir(), 'solid-no-server-profile-'))
  try {
    return await use(profile)
  } finally {
    rmSync(profile, { recursive: true, force: true })
  }
}

async function checkFileProtocol(input: NoServerInput): Promise<void> {
  const html = await buildFor({
    ...input,
    base: './',
    assetsDir: OTHER_ASSETS_DIR
  })
  const url = pathToFileURL(path.join(input.app, 'dist/index.html')).href
  await withProfileFolder(async profile => {
    await withProfile(profile, async context => {
      const opened = await open(context, url)
      const assets = pathToFileURL(
        path.join(input.app, 'dist', OTHER_ASSETS_DIR, '/')
      ).href
      assert.ok(
        opened.fonts[0]?.startsWith(assets),
        `The font must load beside the stylesheet: ${opened.fonts.join(', ')}`
      )
      await exercise({ ...opened, canReusePreload: false })
      await saveStoredTheme({ page: opened.page, profile })
    })
    // A shell keeps its profile between launches; localStorage must survive,
    // and the classic script must read it from file:// too.
    await withProfile(profile, async context => {
      await openWithoutModule(context, { url, html })
      const { page } = await open(context, url)
      await page.locator('html.dark').waitFor({ state: 'attached' })
    })
  })
}

async function rawStatus(origin: string, target: string): Promise<number> {
  const socket = connect(Number(new URL(origin).port), '127.0.0.1')
  await once(socket, 'connect')
  // A raw request line: fetch and URL would normalize the path first.
  socket.write(
    `GET ${target} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`
  )
  let response = ''
  for await (const chunk of socket) response += String(chunk)
  const status = /^HTTP\/1\.1 (?<status>\d{3})/u.exec(response)?.groups?.status
  assert.ok(status, response)
  return Number(status)
}

// The guide shows the plugin that the scenario builds; a change to one side
// alone would leave the scenario testing another plugin.
export function assertGuidePlugin(guide: string): void {
  const config = /```ts\n\/\/ vite\.config\.ts\n(?<code>[\s\S]*?)```/u.exec(
    guide
  )?.groups?.code
  assert.ok(config, 'The guide must show its vite.config.ts')
  const start = config.indexOf('// Applies the stored theme')
  const end = config.indexOf('\n\nexport default')
  assert.ok(start !== -1 && end > start, config)
  assert.equal(config.slice(start, end), STORED_THEME_PLUGIN)
  const imports = config.split('\n').filter(line => line.startsWith('import'))
  for (const line of imports) {
    assert.ok(NO_SERVER_CONFIG.includes(line), `The scenario must ${line}`)
  }
}

export async function checkServerContainment(): Promise<void> {
  const root = mkdtempSync(path.join(tmpdir(), 'solid-no-server-serve-'))
  try {
    const dist = path.join(root, 'dist')
    mkdirSync(path.join(dist, 'assets'), { recursive: true })
    mkdirSync(path.join(root, 'dist-x'))
    writeFileSync(path.join(dist, 'index.html'), '<!doctype html>')
    writeFileSync(path.join(dist, 'assets/app.js'), '')
    writeFileSync(path.join(root, 'secret.txt'), 'secret')
    writeFileSync(path.join(root, 'dist-x/secret.txt'), 'secret')
    const outside = [
      `${SUBFOLDER}../secret.txt`,
      `${SUBFOLDER}assets/../../secret.txt`,
      `${SUBFOLDER}%2e%2e/secret.txt`,
      `${SUBFOLDER}..%2fsecret.txt`,
      `${SUBFOLDER}%2e%2e%2fsecret.txt`,
      String.raw`${SUBFOLDER}..\secret.txt`,
      `${SUBFOLDER}../dist-x/secret.txt`,
      `${SUBFOLDER}%00`,
      `http://127.0.0.1${SUBFOLDER}../secret.txt`,
      `//127.0.0.1${SUBFOLDER}../secret.txt`,
      '/secret.txt',
      '/dist/index.html',
      `${SUBFOLDER}assets`,
      `${SUBFOLDER}assets/`
    ]
    await withServer({ dist }, async origin => {
      for (const target of outside) {
        assert.equal(await rawStatus(origin, target), HTTP_NOT_FOUND, target)
      }
      for (const target of [SUBFOLDER, `${SUBFOLDER}assets/app.js`]) {
        assert.equal(await rawStatus(origin, target), HTTP_OK, target)
      }
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

export async function checkLaunchFailure(): Promise<void> {
  const dist = mkdtempSync(path.join(tmpdir(), 'solid-no-server-launch-'))
  try {
    writeFileSync(path.join(dist, 'index.html'), '<!doctype html>')
    let origin = ''
    const missing = path.join(dist, 'missing-browser')
    await assert.rejects(
      withServer({ dist }, async served => {
        origin = served
        // A keep-alive connection stays open across the failed launch.
        const response = await fetch(`${served}${SUBFOLDER}`)
        assert.equal(response.status, HTTP_OK)
        await withBrowser({ executablePath: missing }, () => {
          throw new Error('The browser must not launch')
        })
      }),
      (error: unknown) =>
        error instanceof Error && error.message.includes(missing)
    )
    await assert.rejects(fetch(`${origin}${SUBFOLDER}`), /fetch failed/u)
  } finally {
    rmSync(dist, { recursive: true, force: true })
  }
}

// A request that throws in the handler gets a 500 and fails the scenario with
// that error, after the server closes.
export async function checkHandlerFailure(): Promise<void> {
  const dist = mkdtempSync(path.join(tmpdir(), 'solid-no-server-handler-'))
  try {
    writeFileSync(path.join(dist, 'index.html'), '<!doctype html>')
    let origin = ''
    // The raw target // names an empty host, so new URL throws.
    await assert.rejects(
      withServer({ dist }, async served => {
        origin = served
        assert.equal(await rawStatus(served, '//'), HTTP_SERVER_ERROR)
        assert.equal(await rawStatus(served, SUBFOLDER), HTTP_OK)
      }),
      { code: 'ERR_INVALID_URL' }
    )
    await assert.rejects(fetch(`${origin}${SUBFOLDER}`), /fetch failed/u)
    const unreadable = new Error('The file cannot be read')
    const statuses: number[] = []
    await assert.rejects(
      withServer(
        {
          dist,
          read: () => {
            throw unreadable
          }
        },
        async served => {
          origin = served
          statuses.push(await rawStatus(served, SUBFOLDER))
          // The page of a scenario fails too; the error of the read wins.
          throw new Error('The page did not load')
        }
      ),
      (error: unknown) => error === unreadable
    )
    assert.deepEqual(statuses, [HTTP_SERVER_ERROR])
    await assert.rejects(fetch(`${origin}${SUBFOLDER}`), /fetch failed/u)
  } finally {
    rmSync(dist, { recursive: true, force: true })
  }
}

export async function checkBrowserCloseFailure(): Promise<void> {
  const dist = mkdtempSync(path.join(tmpdir(), 'solid-no-server-close-'))
  const browsers: Browser[] = []
  try {
    writeFileSync(path.join(dist, 'index.html'), '<!doctype html>')
    let origin = ''
    const closing = new Error('The browser did not close')
    await assert.rejects(
      withServer({ dist }, served => {
        origin = served
        return withBrowser({ channel: CHANNEL }, async browser => {
          browsers.push(browser)
          mock.method(browser, 'close', () => Promise.reject(closing))
          // The page keeps a connection open, which close must end.
          const page = await browser.newPage()
          await page.goto(`${served}${SUBFOLDER}`)
        })
      }),
      (error: unknown) => error === closing
    )
    assert.equal(browsers.length, 1)
    await assert.rejects(fetch(`${origin}${SUBFOLDER}`), /fetch failed/u)
  } finally {
    mock.restoreAll()
    await Promise.all(browsers.map(browser => browser.close()))
    rmSync(dist, { recursive: true, force: true })
  }
}

export async function checkProfileFailure(): Promise<void> {
  const launching = new Error('The profile did not open')
  mock.method(chromium, 'launchPersistentContext', () =>
    Promise.reject(launching)
  )
  const profiles: string[] = []
  try {
    await assert.rejects(
      withProfileFolder(profile => {
        profiles.push(profile)
        assert.ok(existsSync(profile), profile)
        return withProfile(profile, () => {
          throw new Error('The profile must not open')
        })
      }),
      (error: unknown) => error === launching
    )
  } finally {
    mock.restoreAll()
  }
  assert.equal(profiles.length, 1)
  for (const profile of profiles) assert.ok(!existsSync(profile), profile)
}

export async function checkNoServer(input: NoServerInput): Promise<void> {
  const started = performance.now()
  writeNoServerApp(input.app)
  await input.run({
    deadline: input.deadline,
    cwd: input.app,
    args: ['lint', 'src', 'vite.config.ts']
  })
  await input.run({
    deadline: input.deadline,
    cwd: input.app,
    args: ['run', 'tsrs', '--noEmit']
  })
  writeFileSync(
    path.join(input.app, 'vite.config.ts'),
    auditedConfig(NO_SERVER_CONFIG)
  )
  await checkSubfolder(input)
  await checkFileProtocol(input)
  stdout.write(
    `client-only: opened the build from ${SUBFOLDER} and file:// in ${Math.round(performance.now() - started)} ms\n`
  )
}
