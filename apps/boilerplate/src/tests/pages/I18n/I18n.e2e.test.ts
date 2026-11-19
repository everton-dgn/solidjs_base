import { readFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'
import { array, object, optional, parse, string } from 'valibot'

import { testLanguages } from '@/tests/helpers/scenarioLocales/index.ts'

const HTTP_INTERNAL_SERVER_ERROR = 500
const settingsSchema = object({
  baseLocale: string(),
  locales: array(string())
})
const settings = parse(
  settingsSchema,
  JSON.parse(await readFile('project.inlang/settings.json', 'utf8'))
)
const schema = object({
  errorFallback_runtimeTitle: string(),
  errorFallback_runtimeDescription: string(),
  errorFallback_runtimePageTitle: optional(string())
})

const LANGUAGES = await Promise.all(
  settings.locales.map(async locale => {
    const source = await readFile(
      `src/components/organisms/ErrorFallback/i18n/${locale}.json`,
      'utf8'
    )
    return { locale, messages: parse(schema, JSON.parse(source)) }
  })
)

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  for (const { locale, messages } of LANGUAGES) {
    test(`runtime errors publish translated ${locale} metadata without JavaScript`, async ({
      page
    }) => {
      const response = await page.goto(
        testLanguages.path(
          locale,
          `/outside-error?case=render-root&id=${crypto.randomUUID()}`
        )
      )
      expect(response?.status()).toBe(HTTP_INTERNAL_SERVER_ERROR)
      await expect(page).toHaveTitle(
        messages.errorFallback_runtimePageTitle ??
          messages.errorFallback_runtimeTitle
      )
      await expect(
        page.locator('head meta[name="description"]')
      ).toHaveAttribute('content', messages.errorFallback_runtimeDescription)
      await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
        'content',
        'noindex'
      )
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        messages.errorFallback_runtimeTitle
      )
    })
  }
})

test('a server function keeps the page locale when the cookie disagrees', async ({
  page,
  context,
  baseURL
}) => {
  if (!baseURL) throw new Error('Missing test URL')
  await context.addCookies([
    { name: 'locale', value: testLanguages.third, url: baseURL }
  ])
  await page.goto(testLanguages.path(testLanguages.base, '/i18n-action'))
  await expect(
    page.getByRole('button', {
      name: testLanguages.labels(testLanguages.base).theme
    })
  ).toBeEnabled()
  await context.addCookies([
    { name: 'locale', value: testLanguages.third, url: baseURL }
  ])
  const response = page.waitForResponse(candidate =>
    new URL(candidate.url()).pathname.startsWith('/_server/')
  )
  await page.getByRole('button', { name: 'Read server locale' }).focus()
  await page.keyboard.press('Enter')
  await expect(
    page
      .locator('main')
      .getByText(testLanguages.labels(testLanguages.base).title, {
        exact: true
      })
  ).toBeVisible()
  const actionResponse = await response
  expect(actionResponse.headers()['content-language']).toBe(
    testLanguages.header(testLanguages.base)
  )
  await expect(page).toHaveURL(
    testLanguages.path(testLanguages.base, '/i18n-action')
  )
})
