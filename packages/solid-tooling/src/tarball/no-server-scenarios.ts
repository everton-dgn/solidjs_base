/* oxlint-disable node/no-sync -- The scenario owns the temporary application and inspects each completed build. */
import assert from 'node:assert/strict'
import { once } from 'node:events'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { env, stdout } from 'node:process'
import { pathToFileURL } from 'node:url'

import { chromium, type BrowserContext, type Page } from 'playwright'

import type { run as runCommand } from './scenario-process.ts'

type Run = typeof runCommand
type NoServerInput = {
  app: string
  deadline: number
  run: Run
  buildTools: RegExp
}
type BuildInput = NoServerInput & { base: string }
type Opened = { page: Page; fonts: string[] }
type Exercise = Opened & { canReusePreload: boolean }
type StaticServer = { origin: string; close: () => Promise<void> }

// The base of the GitHub Pages project sites; the host serves the build there.
const SUBFOLDER = '/meu-repo/'
const STORAGE_KEY = 'scenario-theme'
const BROWSER_TIMEOUT = 10_000
const HTTP_NOT_FOUND = 404
const HTTP_OK = 200
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

// Kept equal to the plugin in docs/tooling/no-server.md.
const STORED_THEME_PLUGIN = `// Applies the stored theme before the first paint, from a classic script that
// needs no nonce and runs from file://.
const HASH_LENGTH = 8

function storedTheme(): Plugin {
  const source = storedThemeScript(themeOptions)
  const hash = createHash('sha256')
    .update(source)
    .digest('hex')
    .slice(0, HASH_LENGTH)
  const fileName = \`assets/theme-\${hash}.js\`
  let base = '/'
  return {
    name: 'app:stored-theme',
    configResolved(config) {
      ;({ base } = config)
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
  colors: { light: '#ffffff', dark: '#09090b' },
  defaultTheme: 'light'
}
`

const CONFIG = `import { createHash } from 'node:crypto'

import { storedThemeScript } from '@evertondgn/solid-runtime/theme/stored-theme-script'
import { defineSolidApp } from '@evertondgn/solid-tooling/vite'
import type { Plugin } from 'vite-plus'

import { themeOptions } from './src/theme-options.ts'

${STORED_THEME_PLUGIN}

export default defineSolidApp({
  root: import.meta.dirname,
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
// hash routing, the theme in localStorage and its script in index.html.
function writeNoServerApp(app: string): void {
  writeFileSync(path.join(app, 'vite.config.ts'), CONFIG)
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
  base
}: BuildInput): Promise<string> {
  rmSync(path.join(app, 'dist'), { recursive: true, force: true })
  await run({ deadline, cwd: app, args: ['build', '--base', base] })
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
  assert.ok(theme.startsWith(`${base}assets/`), theme)
  const file = path.join(app, 'dist', theme.slice(base.length))
  assert.ok(existsSync(file), file)
  assert.ok(
    html.indexOf(theme) < html.indexOf('type="module"'),
    'The theme script must run before the application module'
  )
  return html
}

function entryScript(html: string): string {
  const entry = /<script type="module"[^>]*src="(?<src>[^"]+)"/u.exec(html)
    ?.groups?.src
  assert.ok(entry, html)
  return entry
}

async function serve(dist: string): Promise<StaticServer> {
  const server = createServer(
    (request: IncomingMessage, response: ServerResponse) => {
      const { pathname } = new URL(request.url ?? '/', 'http://localhost')
      const relative = pathname.startsWith(SUBFOLDER)
        ? pathname.slice(SUBFOLDER.length) || 'index.html'
        : undefined
      const file = relative ? path.join(dist, relative) : undefined
      if (!file?.startsWith(dist) || !existsSync(file)) {
        response.writeHead(HTTP_NOT_FOUND).end()
        return
      }
      response.writeHead(HTTP_OK, {
        'content-type': CONTENT_TYPES[path.extname(file)] ?? 'text/plain'
      })
      response.end(readFileSync(file))
    }
  )
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address !== null && typeof address === 'object')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => {
      const closed = once(server, 'close')
      server.close()
      await closed
    }
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
  // A string runs in the page; the tooling types have no DOM library.
  const loaded: unknown = await page.evaluate(
    `document.fonts.load('16px "Scenario Font"', 'A').then(faces => faces.map(face => face.status))`
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

async function checkSubfolder(input: NoServerInput): Promise<void> {
  const html = await buildFor({ ...input, base: SUBFOLDER })
  const server = await serve(path.join(input.app, 'dist'))
  const browser = await chromium.launch({ channel: CHANNEL })
  try {
    const context = await browser.newContext()
    const url = `${server.origin}${SUBFOLDER}`
    const first = await open(context, url)
    assert.ok(
      first.fonts[0]?.startsWith(`${url}assets/`),
      `The font must load from the subfolder: ${first.fonts.join(', ')}`
    )
    await exercise({ ...first, canReusePreload: true })
    await first.page.close()
    // Without the application module, only the classic theme script can set
    // the class, so this proves the choice is applied before the first paint.
    const second = await context.newPage()
    second.setDefaultTimeout(BROWSER_TIMEOUT)
    const entry = new URL(entryScript(html), url).href
    await second.route(entry, route => route.abort())
    await second.goto(url)
    await second.locator('html.dark').waitFor({ state: 'attached' })
    assert.equal(await second.locator('main').count(), 0)
  } finally {
    await browser.close()
    await server.close()
  }
}

async function checkFileProtocol(input: NoServerInput): Promise<void> {
  await buildFor({ ...input, base: './' })
  const url = pathToFileURL(path.join(input.app, 'dist/index.html')).href
  const profile = mkdtempSync(path.join(tmpdir(), 'solid-no-server-profile-'))
  const launch = (): Promise<BrowserContext> =>
    chromium.launchPersistentContext(profile, {
      channel: CHANNEL,
      args: [FILE_ACCESS]
    })
  try {
    const first = await launch()
    try {
      const opened = await open(first, url)
      const assets = pathToFileURL(path.join(input.app, 'dist/assets/')).href
      assert.ok(
        opened.fonts[0]?.startsWith(assets),
        `The font must load beside the stylesheet: ${opened.fonts.join(', ')}`
      )
      await exercise({ ...opened, canReusePreload: false })
    } finally {
      await first.close()
    }
    // A shell keeps its profile between launches; localStorage must survive.
    const second = await launch()
    try {
      const { page } = await open(second, url)
      await page.locator('html.dark').waitFor({ state: 'attached' })
    } finally {
      await second.close()
    }
  } finally {
    rmSync(profile, { recursive: true, force: true })
  }
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
    args: ['run', 'tsc', '--noEmit']
  })
  writeFileSync(path.join(input.app, 'vite.config.ts'), auditedConfig(CONFIG))
  await checkSubfolder(input)
  await checkFileProtocol(input)
  stdout.write(
    `client-only: opened the build from ${SUBFOLDER} and file:// in ${Math.round(performance.now() - started)} ms\n`
  )
}
