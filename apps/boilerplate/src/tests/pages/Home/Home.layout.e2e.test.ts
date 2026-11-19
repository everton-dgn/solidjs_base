import { expect, test } from '@/tests/helpers/pageWatchers/index.ts'
import { testLanguages } from '@/tests/helpers/scenarioLocales/index.ts'

test.use({ locale: testLanguages.tag(testLanguages.alternate) })

const MOBILE_WIDTH = 375
const DESKTOP_WIDTH = 1280

test.describe('responsive layout', () => {
  for (const width of [MOBILE_WIDTH, DESKTOP_WIDTH]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      test(`${width}px in the ${colorScheme} theme`, async ({
        page,
        pageErrors
      }) => {
        await page.setViewportSize({ width, height: 800 })
        await page.emulateMedia({ colorScheme })
        await page.goto('/')
        await page
          .getByRole('button', {
            name: testLanguages.labels(testLanguages.alternate).theme
          })
          .waitFor()
        await expect(page.locator('html')).toHaveClass(colorScheme)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          )
        ).toBeTruthy()
        await page
          .getByRole('button', {
            name: testLanguages.labels(testLanguages.alternate).theme
          })
          .click()
        await expect(page.getByRole('menu')).toBeVisible()
        await page.keyboard.press('Escape')
        await page.getByRole('link', { name: '404', exact: true }).click()
        await expect(
          page.getByRole('heading', {
            name: testLanguages.labels(testLanguages.alternate).missingHeading
          })
        ).toBeVisible()
        await expect(
          page.getByRole('link', { name: '404', exact: true })
        ).toHaveAttribute('aria-current', 'page')
        await expect(
          page.getByRole('link', {
            name: testLanguages.labels(testLanguages.alternate).homeLink,
            exact: true
          })
        ).not.toHaveAttribute('aria-current')
        await expect(
          page.getByRole('link', { name: '404', exact: true }).locator('span')
        ).toHaveCSS('opacity', '1')
        expect(pageErrors).toEqual([])
      })
    }
  }
})

test.describe('server-rendered navigation', () => {
  test.use({ javaScriptEnabled: false })

  test('shows the current page indicator without hydration', async ({
    page
  }) => {
    await page.goto(testLanguages.path(testLanguages.alternate, ''))
    const home = page.getByRole('link', {
      name: testLanguages.labels(testLanguages.alternate).homeLink,
      exact: true
    })
    const missing = page.getByRole('link', { name: '404', exact: true })
    await expect(home).toHaveAttribute('aria-current', 'page')
    await expect(home.locator('span')).toHaveCSS('opacity', '1')
    await expect(missing).not.toHaveAttribute('aria-current')
    await expect(missing.locator('span')).toHaveCSS('opacity', '0')
  })
})
