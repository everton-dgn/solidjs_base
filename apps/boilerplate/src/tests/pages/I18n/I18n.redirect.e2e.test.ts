import { expect, test } from '@/tests/helpers/pageWatchers/index.ts'
import { testLanguages } from '@/tests/helpers/scenarioLocales/index.ts'

const REDIRECT = 302

for (const [kind, destination] of [
  ['query', testLanguages.path(testLanguages.base, '/i18n-redirect?saved=1')],
  ['parent', testLanguages.path(testLanguages.base, '/next')],
  [
    'fragment',
    testLanguages.path(
      testLanguages.base,
      '/i18n-redirect?filter=active#target'
    )
  ],
  [
    'empty',
    testLanguages.path(testLanguages.base, '/i18n-redirect?filter=active')
  ]
] as const) {
  test(`RPC relative ${kind} redirect resolves against the referring page`, async ({
    page
  }) => {
    await page.goto(
      testLanguages.path(testLanguages.base, '/i18n-redirect?filter=active#old')
    )
    await expect(
      page.getByRole('button', {
        name: testLanguages.labels(testLanguages.base).theme
      })
    ).toBeEnabled()
    await page
      .getByRole('button', { name: `Relative ${kind} redirect` })
      .click()
    await expect(page).toHaveURL(destination)
    await expect(page.locator('html')).toHaveAttribute(
      'lang',
      testLanguages.tag(testLanguages.base)
    )
  })
}
for (const source of ['action', 'query']) {
  test(`${source} redirects across locales load a new document with matching messages`, async ({
    page,
    cspViolations
  }) => {
    await page.goto(testLanguages.path(testLanguages.base, '/i18n-redirect'))
    await expect(
      page.getByRole('button', {
        name: testLanguages.labels(testLanguages.base).theme
      })
    ).toBeEnabled()
    await page.evaluate(
      pageLanguages => {
        document.documentElement.dataset.previousDocument = pageLanguages.base
      },
      {
        base: testLanguages.base,
        alternate: testLanguages.alternate,
        third: testLanguages.third
      }
    )
    const documentResponse = page.waitForResponse(
      response =>
        response.request().isNavigationRequest() &&
        new URL(response.url()).pathname ===
          testLanguages.path(testLanguages.alternate, '/i18n-redirect')
    )
    await page
      .getByRole('button', { name: `Alternate ${source} redirect` })
      .click()
    await documentResponse
    await expect(page).toHaveURL(
      testLanguages.path(
        testLanguages.alternate,
        `/i18n-redirect?from=${source}#target`
      )
    )
    await expect(page.locator('html')).toHaveAttribute(
      'lang',
      testLanguages.tag(testLanguages.alternate)
    )
    await expect(page.getByTestId('locale')).toHaveText(testLanguages.alternate)
    await expect(page.getByTestId('message')).toHaveText(
      testLanguages.labels(testLanguages.alternate).title
    )
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-previous-document'
    )
    expect(cspViolations).toStrictEqual([])
  })
}

test('same-locale action redirects preserve the document and SPA history retains state', async ({
  page
}) => {
  await page.goto(testLanguages.path(testLanguages.base, '/i18n-redirect'))
  await expect(
    page.getByRole('button', {
      name: testLanguages.labels(testLanguages.base).theme
    })
  ).toBeEnabled()
  await page.evaluate(() => {
    document.documentElement.dataset.sameDocument = 'kept'
  })
  await page.getByRole('button', { name: 'Base action redirect' }).click()
  await expect(page).toHaveURL(
    testLanguages.path(testLanguages.base, '/i18n-redirect?from=action#target')
  )
  await page.getByRole('button', { name: 'Same locale state' }).click()
  await expect(page.getByTestId('state')).toContainText('"marker":"kept"')
  await page.goBack()
  await expect(page).toHaveURL(
    testLanguages.path(testLanguages.base, '/i18n-redirect?from=action#target')
  )
  await page.goForward()
  await expect(page).toHaveURL(
    testLanguages.path(testLanguages.base, '/i18n-redirect?from=state#target')
  )
  await expect(page.getByTestId('state')).toContainText('"marker":"kept"')
  await expect(page.locator('html')).toHaveAttribute(
    'data-same-document',
    'kept'
  )
})

test('back and forward across locale history entries reload the selected document', async ({
  page
}) => {
  await page.goto(testLanguages.path(testLanguages.base, '/i18n-redirect'))
  await expect(
    page.getByRole('button', {
      name: testLanguages.labels(testLanguages.base).theme
    })
  ).toBeEnabled()
  // Simulates entries of an earlier integration in the history of the same document.
  await page.evaluate(
    pageLanguages => {
      globalThis.history.pushState(
        { marker: pageLanguages.alternate },
        '',
        `/${pageLanguages.alternate}/i18n-redirect?history=1#target`
      )
      globalThis.history.pushState(
        { marker: pageLanguages.base },
        '',
        `/${pageLanguages.base}/i18n-redirect?history=2#target`
      )
    },
    {
      base: testLanguages.base,
      alternate: testLanguages.alternate,
      third: testLanguages.third
    }
  )
  await page.goBack()
  await expect(page.locator('html')).toHaveAttribute(
    'lang',
    testLanguages.tag(testLanguages.alternate)
  )
  await expect(page.getByTestId('locale')).toHaveText(testLanguages.alternate)
  await expect(page).toHaveURL(
    testLanguages.path(
      testLanguages.alternate,
      '/i18n-redirect?history=1#target'
    )
  )
  await page.goForward()
  await expect(page.locator('html')).toHaveAttribute(
    'lang',
    testLanguages.tag(testLanguages.base)
  )
  await expect(page.getByTestId('locale')).toHaveText(testLanguages.base)
  await expect(page).toHaveURL(
    testLanguages.path(testLanguages.base, '/i18n-redirect?history=2#target')
  )
})

test('SSR query redirect decided before the shell preserves HTTP status and Location', async ({
  request
}) => {
  const url = testLanguages.path(testLanguages.base, '/i18n-redirect?initial=1')
  // On the first request of the process to the route, the redirect goes out after
  // the shell, probably because of the module loading; that path is the one of
  // LateRedirect. On the following ones, it resolves before the shell is sent.
  await request.get(url, { maxRedirects: 0 })
  const response = await request.get(url, { maxRedirects: 0 })
  expect(response.status()).toBe(REDIRECT)
  expect(response.headers().location).toBe(
    testLanguages.path(
      testLanguages.alternate,
      '/i18n-redirect?from=query#target'
    )
  )
})
test('localized fragment and empty navigation retain the page and query', async ({
  page
}) => {
  await page.goto(
    testLanguages.path(testLanguages.base, '/i18n-redirect?filter=active#old')
  )
  await expect(
    page.getByRole('button', {
      name: testLanguages.labels(testLanguages.base).theme
    })
  ).toBeEnabled()
  await page.evaluate(() => {
    document.documentElement.dataset.sameDocument = 'kept'
  })
  await page.getByRole('button', { name: 'Navigate fragment' }).click()
  await expect(page).toHaveURL(
    testLanguages.path(
      testLanguages.base,
      '/i18n-redirect?filter=active#target'
    )
  )
  await page.getByRole('button', { name: 'Navigate empty' }).click()
  await expect(page).toHaveURL(
    testLanguages.path(testLanguages.base, '/i18n-redirect?filter=active')
  )
  await expect(page.locator('html')).toHaveAttribute(
    'data-same-document',
    'kept'
  )
})
