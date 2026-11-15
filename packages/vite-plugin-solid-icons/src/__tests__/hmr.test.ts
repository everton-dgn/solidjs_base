import assert from 'node:assert/strict'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'

import solid from '@solidjs/vite-plugin'
import type { Page } from 'playwright'
import {
  createLogger,
  createServer,
  type Logger,
  type ViteDevServer
} from 'vite-plus'

import { solidIcons } from '../index.ts'
import { launchBrowser } from './browser.ts'
import {
  createFixtureApp,
  defer,
  fixtureConfig,
  MOON_FILE,
  STAR_FILE,
  TYPES_FILE
} from './fixture-app.ts'

type PayloadLog = { types: string[]; loads: number }
type TypesWait = { file: string; pattern: RegExp; module: string }
type FileEvent = { server: ViteDevServer; event: WatchEvent; file: string }
type WatchEvent = 'add' | 'change' | 'unlink'

// Generous, so a loaded runner finishes; a failure names what it waited for.
const WAIT_TIMEOUT = 60_000
const POLL_INTERVAL = 100
const STAR = '[data-icon="star"]'
const MOON = '[data-icon="moon"]'
const SVG = '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>'

function payloadType(frame: string): string {
  const payload: unknown = JSON.parse(frame)
  return typeof payload === 'object' &&
    payload !== null &&
    'type' in payload &&
    typeof payload.type === 'string'
    ? payload.type
    : ''
}

// The messages of the dev server as the page receives them, and the number of
// times the page loaded.
function watchPage(page: Page): PayloadLog {
  const log: PayloadLog = { types: [], loads: 0 }
  page.on('websocket', socket => {
    socket.on('framereceived', ({ payload }) => {
      if (typeof payload === 'string') log.types.push(payloadType(payload))
    })
  })
  page.on('load', () => {
    log.loads += 1
  })
  return log
}

// WHY: the dev server of these tests has no file watcher, whose events come
// late on a loaded machine; the test reports each change itself, as the
// watcher would.
function report({ server, event, file }: FileEvent): void {
  server.watcher.emit(event, file)
}

// A logger that keeps the errors of the dev server, where the dependency scan
// reports an import it cannot resolve.
function errorLog(errors: string[]): Logger {
  return {
    ...createLogger('error'),
    error: message => {
      errors.push(message)
    }
  }
}

// The declarations of a collection, once the plugin wrote them after the
// change.
async function waitForTypes({
  file,
  pattern,
  module
}: TypesWait): Promise<string> {
  const deadline = Date.now() + WAIT_TIMEOUT
  const start = `declare module 'icon:${module}' {`
  for (;;) {
    const types = await readFile(file, 'utf8')
    const declarations = types.slice(types.indexOf(start)).split('\n}')[0] ?? ''
    if (pattern.test(declarations)) return declarations
    if (Date.now() > deadline) {
      throw new Error(
        `The declarations of icon:${module} did not match ${String(pattern)} in ${WAIT_TIMEOUT} ms.`
      )
    }
    await delay(POLL_INTERVAL)
  }
}

test('a folder icon follows its SVG file in the dev server', async context => {
  const root = await createFixtureApp()
  defer({ context, task: () => rm(root, { recursive: true, force: true }) })
  const errors: string[] = []
  const server = await createServer({
    ...fixtureConfig({ root, isSsr: false }),
    customLogger: errorLog(errors),
    server: { port: 0, strictPort: false, watch: null }
  })
  defer({ context, task: () => server.close() })
  await server.listen()
  const browser = await launchBrowser()
  defer({ context, task: () => browser.close() })
  const page = await browser.newPage()
  const log = watchPage(page)
  const [url = ''] = server.resolvedUrls?.local ?? []
  const star = path.join(root, STAR_FILE)
  const original = await readFile(star, 'utf8')
  const starFill = (fill: string) =>
    page.waitForSelector(`${STAR} path[fill="${fill}"]`, {
      timeout: WAIT_TIMEOUT
    })

  await page.goto(url)
  await starFill('red')

  await context.test(
    'the dependency scan passes over the named imports',
    () => {
      assert.deepEqual(errors, [])
    }
  )

  await context.test('an edited SVG updates without a reload', async () => {
    log.types.length = 0
    await writeFile(star, original.replace('fill="red"', 'fill="green"'))
    report({ server, event: 'change', file: star })
    await starFill('green')

    assert.equal(log.loads, 1)
    assert.ok(log.types.includes('update'))
    assert.ok(!log.types.includes('full-reload'))
  })

  await context.test('a removed SVG shows the error', async () => {
    await rm(star)
    report({ server, event: 'unlink', file: star })

    await page
      .locator('vite-error-overlay')
      .getByText('Icon "own/star" not found')
      .first()
      .waitFor({ timeout: WAIT_TIMEOUT })
  })

  await context.test('an added SVG answers the import again', async () => {
    // A reload sent right after the error page loaded had no effect in the
    // page; the file changes once the page is idle.
    await page.waitForLoadState('networkidle')
    await writeFile(star, original.replace('fill="red"', 'fill="blue"'))
    report({ server, event: 'add', file: star })
    await starFill('blue')

    assert.equal(await page.locator('vite-error-overlay').count(), 0)
  })

  const moon = path.join(root, MOON_FILE)
  const renamedMoon = path.join(root, 'icons/moon-2.svg')
  const types = path.join(root, TYPES_FILE)

  await context.test(
    'a renamed SVG changes the export names of its collection',
    async () => {
      await page.locator(MOON).waitFor({ timeout: WAIT_TIMEOUT })
      await page.waitForLoadState('networkidle')
      await rename(moon, renamedMoon)
      report({ server, event: 'unlink', file: moon })
      report({ server, event: 'add', file: renamedMoon })

      await page
        .locator('vite-error-overlay')
        .getByText(`"Moon" is not an icon of 'icon:own'. Did you mean Moon2?`)
        .first()
        .waitFor({ timeout: WAIT_TIMEOUT })
      const declarations = await waitForTypes({
        file: types,
        pattern: /export const Moon2:/u,
        module: 'own'
      })
      assert.match(declarations, /export const Moon2: IconComponent/u)
      assert.doesNotMatch(declarations, /export const Moon: /u)
    }
  )

  await context.test(
    'an SVG renamed back answers the named import again',
    async () => {
      await page.waitForLoadState('networkidle')
      await rename(renamedMoon, moon)
      report({ server, event: 'unlink', file: renamedMoon })
      report({ server, event: 'add', file: moon })

      await page.locator(MOON).waitFor({ timeout: WAIT_TIMEOUT })
      assert.equal(await page.locator('vite-error-overlay').count(), 0)
      const declarations = await waitForTypes({
        file: types,
        pattern: /export const Moon: /u,
        module: 'own'
      })
      assert.doesNotMatch(declarations, /export const Moon2:/u)
    }
  )
})

test('a new SVG reaches every collection of a shared folder', async context => {
  const root = await createFixtureApp()
  defer({ context, task: () => rm(root, { recursive: true, force: true }) })
  await writeFile(
    path.join(root, 'src/brand.ts'),
    "import { Sun } from 'icon:brand'\nexport { Sun }\n"
  )
  const server = await createServer({
    ...fixtureConfig({ root, isSsr: false }),
    plugins: [
      solidIcons({ collections: { own: './icons', brand: './icons' } }),
      solid()
    ],
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, watch: null }
  })
  defer({ context, task: () => server.close() })
  const { client } = server.environments
  await assert.rejects(
    client.transformRequest('/src/brand.ts'),
    /"Sun" is not an icon of 'icon:brand'/u
  )

  const sun = path.join(root, 'icons/sun.svg')
  await writeFile(sun, SVG)
  report({ server, event: 'add', file: sun })

  const types = path.join(root, TYPES_FILE)
  for (const module of ['own', 'brand']) {
    await waitForTypes({ file: types, pattern: /export const Sun:/u, module })
  }
  const brand = await client.transformRequest('/src/brand.ts')
  assert.match(brand?.code ?? '', /icon:brand\/sun/u)
})
