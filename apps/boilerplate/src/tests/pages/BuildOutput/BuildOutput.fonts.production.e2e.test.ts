import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@/tests/helpers/pageWatchers/index.ts'

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const ASSETS = path.join(ROOT, '.vercel/output/static/assets')
// Keep the original faces as an independent migration regression oracle.
const FACES = [
  {
    file: 'inter-latin-wght-normal',
    unicodeRange:
      'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'
  },
  {
    file: 'inter-latin-ext-wght-normal',
    unicodeRange:
      'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF'
  }
]

test('emits both original Inter files once with matching font face descriptors', async () => {
  const files = await readdir(ASSETS)
  const fonts = files.filter(file => file.endsWith('.woff2'))
  const cssFile = files.find(file => file.startsWith('solid-fonts-'))
  expect(fonts).toHaveLength(FACES.length)
  expect(cssFile).toBeDefined()
  const css = await readFile(path.join(ASSETS, cssFile ?? ''), 'utf8')
  for (const face of FACES) {
    const emitted = fonts.filter(file => file.startsWith(`${face.file}-`))
    expect(emitted).toHaveLength(1)
    expect(await readFile(path.join(ASSETS, emitted[0] ?? ''))).toEqual(
      await readFile(path.join(ROOT, 'src/assets/fonts', `${face.file}.woff2`))
    )
    const rule = css
      .split('@font-face')
      .find(value => value.includes(emitted[0] ?? 'missing'))
    expect(rule).toContain('font-family: "Inter"')
    expect(rule).toContain('font-weight: 100 900')
    expect(rule).toContain('font-style: normal')
    expect(rule).toContain('font-display: swap')
    expect(rule).toContain(`unicode-range: ${face.unicodeRange}`)
  }
  expect(css).not.toContain('data:')
})

test('loads the Latin font once and the extended subset on demand under the real CSP', async ({
  page,
  cspViolations,
  pageErrors
}) => {
  const requests: string[] = []
  page.on('request', request => {
    if (request.resourceType() === 'font') requests.push(request.url())
  })
  const response = await page.goto('/')
  const html = await response?.text()
  expect(html).not.toMatch(/<style\b|\sstyle\s*=/iu)
  await page.evaluate(() => document.fonts.ready)
  const font = page.locator('link[rel="preload"][as="font"]')
  await expect(font).toHaveCount(1)
  const href = await font.getAttribute('href')
  expect(href).toMatch(/\/inter-latin-wght-normal-[a-f\d]+\.woff2$/u)
  expect(requests).toEqual([new URL(href ?? '', page.url()).href])
  const loaded = await page.evaluate(
    () =>
      [...document.fonts].filter(
        face => face.family === 'Inter' && face.status === 'loaded'
      ).length
  )
  expect(loaded).toBe(1)
  const stylesheet = await page
    .locator('link[rel="stylesheet"][href*="solid-fonts-"]')
    .getAttribute('href')
  const css = await page.request.get(stylesheet ?? '')
  expect(await css.text()).toContain(`url("${href}")`)
  await page.evaluate(() => document.fonts.load('500 16px Inter', 'Łőş'))
  expect(requests.filter(url => url.includes('inter-latin-ext-'))).toHaveLength(
    1
  )
  expect(
    requests.filter(url => url.includes('inter-latin-wght-'))
  ).toHaveLength(1)
  expect(cspViolations).toEqual([])
  expect(pageErrors).toEqual([])
})
