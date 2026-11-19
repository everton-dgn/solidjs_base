import type { GenerationContext } from './generate.ts'

const themeCheck = `
  await page.getByRole('button', { name: /select theme/iu }).click()
  await page.getByRole('menuitemradio', { name: 'Dark', exact: true }).click()
  await expect(page.locator('html')).toHaveClass('dark')
  await page.reload()
  await expect(page.locator('html')).toHaveClass('dark')`
const fontCheck = `
  await expect(page.locator('link[rel="preload"][as="font"]')).toHaveCount(1)
  await expect
    .poll(() => page.evaluate(() => document.fonts.check('16px Inter')))
    .toBe(true)`

export function addProfileBrowserTest({
  profile,
  write
}: GenerationContext): void {
  if (
    [profile.theme, profile.fonts, profile.icons, profile.diagnostics].every(
      flag => flag !== false
    )
  ) {
    return
  }
  write(
    'src/tests/pages/Home/Home.profile.production.e2e.test.ts',
    `import { expect, test } from '@playwright/test'

test('mounts and opens a localized route directly', async ({ page }) => {
  await page.goto('/en')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'SolidJS Boilerplate for web applications'
  )
  await page.getByRole('button', { name: /select language/iu }).click()
  await expect(page.getByRole('menu')).toBeVisible()
  await page.goto('/en/about')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'About SolidJS Boilerplate'
  )${profile.theme === false ? '' : themeCheck}${profile.fonts === false ? '' : fontCheck}
})
`
  )
}
