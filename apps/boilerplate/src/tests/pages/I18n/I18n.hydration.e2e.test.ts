import { holdRoute } from '@/tests/helpers/holdRoute/index.ts'
import { hydrationFinished } from '@/tests/helpers/hydrationFinished/index.ts'
import { expect, test } from '@/tests/helpers/pageWatchers/index.ts'
import { testLanguages } from '@/tests/helpers/scenarioLocales/index.ts'

const LOCALES = testLanguages.locales
  .filter(locale => testLanguages.other(locale) !== locale)
  .map(locale => testLanguages.labels(locale))

for (const language of LOCALES) {
  test(`recovers the selected ${language.locale} history entry when its locale changes before hydration`, async ({
    page,
    pageErrors,
    cspViolations
  }) => {
    await page.goto(testLanguages.path(language.locale, '/i18n-redirect'))
    await expect.poll(() => hydrationFinished(page)).toBe(true)
    await page.evaluate(
      ({ locale, other, previous, current }) => {
        globalThis.history.pushState({ marker: other }, '', previous)
        globalThis.history.pushState({ marker: locale }, '', current)
      },
      {
        ...language,
        previous: testLanguages.path(
          language.other,
          '/i18n-redirect?history=1#target'
        ),
        current: testLanguages.path(
          language.locale,
          '/i18n-redirect?history=2#target'
        )
      }
    )
    const historyLength = await page.evaluate(() => globalThis.history.length)
    const scripts = await holdRoute({ page, url: '**/*.js' })

    try {
      await page.goBack({ waitUntil: 'commit' })
      await scripts.requested
      await expect(page.locator('html')).toHaveAttribute(
        'lang',
        language.otherTag
      )
      expect(await hydrationFinished(page)).toBe(false)
      await page.goForward({ waitUntil: 'commit' })
      await expect(page).toHaveURL(
        testLanguages.path(language.locale, '/i18n-redirect?history=2#target')
      )
      await expect(page.locator('html')).toHaveAttribute(
        'lang',
        language.otherTag
      )
      expect(await hydrationFinished(page)).toBe(false)
      await scripts.release()

      await expect(page.locator('html')).toHaveAttribute('lang', language.tag)
      await expect(page.getByTestId('locale')).toHaveText(language.locale)
      await expect.poll(() => hydrationFinished(page)).toBe(true)
      await expect(page).toHaveURL(
        testLanguages.path(language.locale, '/i18n-redirect?history=2#target')
      )
      expect(
        await page.evaluate(() => ({
          state: globalThis.history.state as unknown,
          length: globalThis.history.length
        }))
      ).toMatchObject({
        state: { marker: language.locale },
        length: historyLength
      })
      await page.getByRole('button', { name: language.theme }).click()
      await expect(page.getByRole('menu')).toBeVisible()
      expect(pageErrors).toEqual([])
      expect(cspViolations).toEqual([])
    } finally {
      await scripts.release()
    }
  })
}

test('keeps the SSR document when history changes within its locale before hydration', async ({
  page
}) => {
  const scripts = await holdRoute({ page, url: '**/*.js' })
  try {
    await page.goto(
      testLanguages.path(testLanguages.alternate, '/i18n-redirect'),
      {
        waitUntil: 'commit'
      }
    )
    await scripts.requested
    await expect(page.getByTestId('locale')).toHaveText(testLanguages.alternate)
    expect(await hydrationFinished(page)).toBe(false)
    await page.evaluate(
      pageLanguages => {
        document.documentElement.dataset.ssrDocument = 'kept'
        globalThis.history.pushState(
          { marker: 'kept' },
          '',
          `/${pageLanguages.alternate}/i18n-redirect?history=1#target`
        )
      },
      {
        base: testLanguages.base,
        alternate: testLanguages.alternate,
        third: testLanguages.third
      }
    )
    await scripts.release()

    await expect.poll(() => hydrationFinished(page)).toBe(true)
    await expect(page.locator('html')).toHaveAttribute(
      'data-ssr-document',
      'kept'
    )
    await expect(page).toHaveURL(
      testLanguages.path(
        testLanguages.alternate,
        '/i18n-redirect?history=1#target'
      )
    )
    expect(
      await page.evaluate(() => globalThis.history.state as unknown)
    ).toMatchObject({ marker: 'kept' })
    await page
      .getByRole('button', {
        name: testLanguages.labels(testLanguages.alternate).theme
      })
      .click()
    await expect(page.getByRole('menu')).toBeVisible()
  } finally {
    await scripts.release()
  }
})

test('does not reload an unchanged URL when its SSR language differs', async ({
  page,
  pageErrors,
  cspViolations
}) => {
  let documentRequests = 0
  await page.route(
    `**/${testLanguages.alternate}/i18n-redirect`,
    async route => {
      documentRequests += 1
      const response = await route.fetch()
      const html = await response.text()
      const body = html.replace(
        `lang="${testLanguages.tag(testLanguages.alternate)}"`,
        `lang="${testLanguages.tag(testLanguages.base)}"`
      )
      await route.fulfill({ response, body })
    }
  )

  await page.goto(
    testLanguages.path(testLanguages.alternate, '/i18n-redirect'),
    {
      waitUntil: 'commit'
    }
  )
  await expect.poll(() => hydrationFinished(page)).toBe(true)
  await page
    .getByRole('button', {
      name: testLanguages.labels(testLanguages.alternate).theme
    })
    .click()
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(page).toHaveURL(
    testLanguages.path(testLanguages.alternate, '/i18n-redirect')
  )
  expect(documentRequests).toBe(1)
  expect(pageErrors).toEqual([])
  expect(cspViolations).toEqual([])
})
