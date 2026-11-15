import assert from 'node:assert/strict'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { env } from 'node:process'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'

import { chromium, type Page } from 'playwright'
import { createServer, type FSWatcher } from 'vite-plus'

import {
  createFixtureApp,
  fixtureConfig,
  MOON_FILE,
  STAR_FILE,
  TYPES_FILE
} from './fixture-app.ts'

type PayloadLog = { types: string[]; loads: number }
type TypesWait = { file: string; pattern: RegExp }

const WAIT_TIMEOUT = 30_000
const QUIET_TIME = 1000
const POLL_INTERVAL = 100
const STAR = '[data-icon="star"]'
const MOON = '[data-icon="moon"]'
const OWN_MODULE = "declare module 'icon:own' {"

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

// The watcher still reports the files the fixture has just written, and Vite
// reloads the page for them; the test starts once those events are over.
async function settle(watcher: FSWatcher): Promise<void> {
  let lastEvent = Date.now()
  const onEvent = () => {
    lastEvent = Date.now()
  }
  async function waitForQuiet(): Promise<void> {
    await delay(QUIET_TIME)
    if (Date.now() - lastEvent < QUIET_TIME) await waitForQuiet()
  }
  watcher.on('all', onEvent)
  await waitForQuiet()
  watcher.off('all', onEvent)
}

// The declarations of the folder collection, once the plugin wrote them
// after the watcher reported the file.
async function waitForOwnTypes({ file, pattern }: TypesWait): Promise<string> {
  const deadline = Date.now() + WAIT_TIMEOUT
  async function poll(): Promise<string> {
    const types = await readFile(file, 'utf8')
    const own = types.slice(types.indexOf(OWN_MODULE))
    if (pattern.test(own) || Date.now() > deadline) return own
    await delay(POLL_INTERVAL)
    return poll()
  }
  return poll()
}

test('a folder icon follows its SVG file in the dev server', async context => {
  const root = await createFixtureApp()
  context.after(() => rm(root, { recursive: true, force: true }))
  const server = await createServer({
    ...fixtureConfig({ root, isSsr: false }),
    // Polling, because a loaded machine delays the file events of the system
    // for tens of seconds.
    server: {
      port: 0,
      strictPort: false,
      watch: { usePolling: true, interval: POLL_INTERVAL }
    }
  })
  context.after(() => server.close())
  await server.listen()
  await settle(server.watcher)
  // The CI runner has the Chrome of the system, as in the browser tests of
  // the runtime package.
  const browser = await chromium.launch(env.CI ? { channel: 'chrome' } : {})
  context.after(() => browser.close())
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

  await context.test('an edited SVG updates without a reload', async () => {
    log.types.length = 0
    await writeFile(star, original.replace('fill="red"', 'fill="green"'))
    await starFill('green')

    assert.equal(log.loads, 1)
    assert.ok(log.types.includes('update'))
    assert.ok(!log.types.includes('full-reload'))
  })

  await context.test('a removed SVG shows the error', async () => {
    await rm(star)

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

      await page
        .locator('vite-error-overlay')
        .getByText(`"Moon" is not an icon of 'icon:own'. Did you mean Moon2?`)
        .first()
        .waitFor({ timeout: WAIT_TIMEOUT })
      const declarations = await waitForOwnTypes({
        file: types,
        pattern: /export const Moon2:/u
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

      await page.locator(MOON).waitFor({ timeout: WAIT_TIMEOUT })
      assert.equal(await page.locator('vite-error-overlay').count(), 0)
      const declarations = await waitForOwnTypes({
        file: types,
        pattern: /export const Moon: /u
      })
      assert.doesNotMatch(declarations, /export const Moon2:/u)
    }
  )
})
