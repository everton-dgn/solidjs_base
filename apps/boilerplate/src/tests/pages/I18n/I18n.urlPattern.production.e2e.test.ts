import type { Page } from '@playwright/test'

import { hydrationFinished } from '@/tests/helpers/hydrationFinished/index.ts'
import { expect, test } from '@/tests/helpers/pageWatchers/index.ts'
import { testLanguages } from '@/tests/helpers/scenarioLocales/index.ts'
import { watchCspViolations } from '@/tests/helpers/watchCspViolations/index.ts'

type UrlPatternKind = 'native' | 'polyfill' | 'missing'

type LoadedPage = { scripts: Set<string>; urlPattern: UrlPatternKind }

const POLYFILL_CHUNK = /\/assets\/urlpattern-polyfill-[\w-]+\.js$/u

const readUrlPatternKind = (page: Page) =>
  page.evaluate<UrlPatternKind>(() => {
    if (typeof URLPattern !== 'function') return 'missing'
    return URLPattern.toString().includes('[native code]')
      ? 'native'
      : 'polyfill'
  })

async function loadHome(page: Page): Promise<LoadedPage> {
  const scripts = new Set<string>()
  page.on('request', request => {
    if (request.resourceType() === 'script') {
      scripts.add(new URL(request.url()).pathname)
    }
  })
  await page.goto(testLanguages.path(testLanguages.alternate, ''))
  await expect.poll(() => hydrationFinished(page)).toBe(true)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    testLanguages.labels(testLanguages.alternate).title
  )
  // The copy ends the collection at the same point on both pages.
  return {
    scripts: new Set(scripts),
    urlPattern: await readUrlPatternKind(page)
  }
}

// The build target includes browsers without the API (docs/i18n.md); Chromium
// simulates that path by removing the global.
test('loads the URLPattern polyfill only without the native API and keeps the localized navigation', async ({
  browser,
  page,
  pageErrors,
  cspViolations
}) => {
  const nativeContext = await browser.newContext()
  try {
    const nativePage = await nativeContext.newPage()
    const nativeErrors: string[] = []
    nativePage.on('pageerror', error => nativeErrors.push(error.message))
    const nativeViolations = await watchCspViolations(nativePage)
    const native = await loadHome(nativePage)
    expect(native.urlPattern).toBe('native')
    expect(nativeErrors).toEqual([])
    expect(nativeViolations).toEqual([])

    await page.addInitScript(() => {
      Reflect.deleteProperty(globalThis, 'URLPattern')
    })
    const fallback = await loadHome(page)
    expect(fallback.urlPattern).toBe('polyfill')
    expect(
      [...native.scripts].filter(path => !fallback.scripts.has(path))
    ).toEqual([])
    expect(
      [...fallback.scripts].filter(path => !native.scripts.has(path))
    ).toEqual([expect.stringMatching(POLYFILL_CHUNK)])
  } finally {
    await nativeContext.close()
  }

  await page.getByRole('link', { name: '404', exact: true }).click()
  await expect(page).toHaveURL(
    testLanguages.path(testLanguages.alternate, '/404')
  )
  await expect(page).toHaveTitle(
    testLanguages.labels(testLanguages.alternate).missing
  )
  await page
    .getByRole('link', {
      name: testLanguages.labels(testLanguages.alternate).home
    })
    .click()
  await expect(page).toHaveURL(testLanguages.path(testLanguages.alternate, ''))
  await page
    .getByRole('button', {
      name: testLanguages.labels(testLanguages.alternate).selector
    })
    .click()
  await page
    .getByRole('menuitemradio', {
      name: testLanguages.labels(testLanguages.base).name,
      exact: true
    })
    .click()
  await expect(page).toHaveURL(testLanguages.path(testLanguages.base, ''))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    testLanguages.labels(testLanguages.base).title
  )
  await expect.poll(() => hydrationFinished(page)).toBe(true)
  expect(await readUrlPatternKind(page)).toBe('polyfill')
  expect(pageErrors).toEqual([])
  expect(cspViolations).toEqual([])
})
