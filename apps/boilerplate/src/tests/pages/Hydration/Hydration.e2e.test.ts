import { m } from '@paraglide/messages.js'
import type { Page } from '@playwright/test'

import { holdRoute } from '@/tests/helpers/holdRoute/index.ts'
import { hydrationFinished } from '@/tests/helpers/hydrationFinished/index.ts'
import { expect, test } from '@/tests/helpers/pageWatchers/index.ts'
import { testLanguages } from '@/tests/helpers/testLanguages/index.ts'

const HTTP_OK = 200
const PAGE_URL = testLanguages.path(testLanguages.base, '')
const SCRIPTS = '**/*.js'
const MARKER = 'data-hydration-ended'
const HOME_TITLE = testLanguages.labels(testLanguages.base).title
const ABOUT_TITLE = testLanguages.labels(testLanguages.base).about
const THEME_BUTTON = testLanguages.labels(testLanguages.base).theme
// The order of the attributes is not part of the plugin contract.
const ENTRY_SCRIPT =
  /<script\b(?=[^>]*\btype="module")(?=[^>]*\basync\b)[^>]*>/u

async function expectServerDocument(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(HOME_TITLE)
  await expect(
    page.getByRole('link', {
      name: testLanguages.labels(testLanguages.base).homeLink,
      exact: true
    })
  ).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('menu')).toHaveCount(0)
  expect(await hydrationFinished(page)).toBe(false)
}

async function expectInteractiveDocument(page: Page): Promise<void> {
  await expect.poll(() => hydrationFinished(page)).toBe(true)
  await page.getByRole('button', { name: THEME_BUTTON }).click()
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).not.toBeVisible()
}

test('serves the document without the hydration marker', async ({
  request
}) => {
  const response = await request.get(PAGE_URL)
  const html = await response.text()
  expect(response.status()).toBe(HTTP_OK)
  expect(html).toMatch(
    new RegExp(
      String.raw`<html\b[^>]*\blang="${testLanguages.tag(testLanguages.base)}"`,
      'u'
    )
  )
  expect(html).toContain(HOME_TITLE)
  expect(html).toMatch(ENTRY_SCRIPT)
  expect(html).not.toContain(MARKER)
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('keeps the server document unmarked and without handlers', async ({
    page
  }) => {
    await page.goto(PAGE_URL)
    await expectServerDocument(page)
    const trigger = page.getByRole('button', {
      name: THEME_BUTTON
    })
    await expect(trigger).toBeDisabled()
    expect(await page.evaluate(() => document.readyState)).toBe('complete')
  })
})

test('marks hydration only after the bundle runs, on every document load', async ({
  page,
  pageErrors,
  cspViolations
}) => {
  let gate = await holdRoute({ page, url: SCRIPTS })
  try {
    await page.goto(PAGE_URL, { waitUntil: 'commit' })
    await gate.requested
    await expectServerDocument(page)
    await gate.release()
    await expectInteractiveDocument(page)

    gate = await holdRoute({ page, url: SCRIPTS })
    await page.reload({ waitUntil: 'commit' })
    await gate.requested
    await expectServerDocument(page)
    await gate.release()
    await expectInteractiveDocument(page)
    expect(pageErrors).toEqual([])
    expect(cspViolations).toEqual([])
  } finally {
    await gate.release()
  }
})

test('does not mark hydration when the bundle fails to load', async ({
  page
}) => {
  const entryFailed = page.waitForEvent('requestfailed', request =>
    request.url().endsWith('.js')
  )
  await page.route(SCRIPTS, route => route.abort('failed'))
  await page.goto(PAGE_URL)
  await entryFailed
  expect(await page.evaluate(() => document.readyState)).toBe('complete')
  await expectServerDocument(page)
  await expect(page.getByRole('button', { name: THEME_BUTTON })).toBeDisabled()
})

test('keeps the marker and interactivity across client-side navigation', async ({
  page,
  pageErrors,
  cspViolations
}) => {
  let documentRequests = 0
  page.on('request', request => {
    if (request.resourceType() === 'document') documentRequests += 1
  })
  await page.goto(PAGE_URL)
  await expectInteractiveDocument(page)

  const navigation = page.getByRole('navigation', {
    name: m.topbar_navigation({}, { locale: testLanguages.base }),
    exact: true
  })
  await navigation
    .getByRole('link', {
      name: m.siteLinks_aboutLabel({}, { locale: testLanguages.base }),
      exact: true
    })
    .click()
  await expect(page).toHaveURL(testLanguages.path(testLanguages.base, '/about'))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ABOUT_TITLE)
  await expect(
    navigation.getByRole('link', {
      name: m.siteLinks_aboutLabel({}, { locale: testLanguages.base }),
      exact: true
    })
  ).toHaveAttribute('aria-current', 'page')
  await expectInteractiveDocument(page)

  await navigation
    .getByRole('link', {
      name: testLanguages.labels(testLanguages.base).homeLink,
      exact: true
    })
    .click()
  await expect(page).toHaveURL(PAGE_URL)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(HOME_TITLE)
  await expectInteractiveDocument(page)
  expect(documentRequests).toBe(1)
  expect(pageErrors).toEqual([])
  expect(cspViolations).toEqual([])
})

test('replays a click captured before hydration after the bundle is released', async ({
  page,
  pageErrors
}) => {
  const gate = await holdRoute({ page, url: SCRIPTS })
  try {
    await page.goto(PAGE_URL, { waitUntil: 'commit' })
    await gate.requested
    await page
      .getByRole('button', {
        name: testLanguages.labels(testLanguages.base).selector
      })
      .click()
    await expect(page.getByRole('menu')).toHaveCount(0)
    expect(await hydrationFinished(page)).toBe(false)
    await gate.release()

    await expect.poll(() => hydrationFinished(page)).toBe(true)
    await expect(
      page.getByRole('menu', {
        name: m.localeSwitcher_label({}, { locale: testLanguages.base }),
        exact: true
      })
    ).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).not.toBeVisible()
    await expectInteractiveDocument(page)
    expect(pageErrors).toEqual([])
  } finally {
    await gate.release()
  }
})
