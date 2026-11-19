import type { GenerationContext } from '../types.ts'

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

const staticPublication = `
test.describe('prerendered publication', () => {
  test.use({ javaScriptEnabled: false })

  test('serves the localized page and publication files without JavaScript', async ({
    page,
    request
  }) => {
    const response = await page.goto('/pt/about')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
    await expect(page.locator('head link[rel="canonical"]')).toHaveCount(1)
    expect(response?.headers()['content-security-policy']).toContain('sha256-')
    expect(response?.headers()['content-security-policy']).toContain(
      "form-action 'self'"
    )
    expect(response?.headers()['x-content-type-options']).toBe('nosniff')
    const markdown = await request.head('/pt/about.md')
    expect(markdown.headers()['content-type']).toBe(
      'text/markdown; charset=utf-8'
    )
    const unsupported = await request.post('/pt/about')
    expect(unsupported.headers().allow).toBe('GET, HEAD')
    const methodNotAllowed = 405
    expect(unsupported.status()).toBe(methodNotAllowed)
    for (const file of [
      '/robots.txt',
      '/sitemap.xml',
      '/llms.txt',
      '/llms-full.txt',
      '/pt/about.md'
    ]) {
      const published = await request.get(file)
      expect(published.ok()).toBe(true)
      const body = await published.text()
      expect(body.trim().length).toBeGreaterThan(0)
    }
    const notFound = 404
    const missing = await page.goto('/pt/missing-page')
    expect(missing?.status()).toBe(notFound)
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
  })
})
`

export function addProfileBrowserTest({
  profile,
  write
}: GenerationContext): void {
  if (
    profile.mode !== 'static' &&
    [
      profile.hasTheme,
      profile.hasFonts,
      profile.hasIcons,
      profile.hasDiagnostics,
      profile.hasSeo
    ].every(flag => flag !== false)
  ) {
    return
  }
  write({
    file: 'src/tests/pages/Home/Home.profile.production.e2e.test.ts',
    content: `import { expect, test } from '@playwright/test'

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
  )${profile.hasTheme === false ? '' : themeCheck}${profile.hasFonts === false ? '' : fontCheck}
})
${profile.mode === 'static' && profile.hasSeo !== false ? staticPublication : ''}`
  })
}
