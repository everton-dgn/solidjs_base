import { m } from '@paraglide/messages.js'
import { baseLocale, getLocale } from '@paraglide/runtime.js'
import { paraglideMiddleware } from '@paraglide/server.js'

import { SITE_CACHE_CONTROL } from '@/constants/cache.ts'
import { testLanguages } from '@/tests/helpers/testLanguages/index.ts'

import { GET } from '../index.ts'

const { alternate } = testLanguages

const BASE_DESCRIPTION = m.site_description({}, { locale: baseLocale })
const INDEX_LANGUAGE =
  new Intl.DisplayNames(['en'], { type: 'language' }).of(baseLocale) ??
  baseLocale

function inLocaleContext(read: () => Promise<Response>): Promise<Response> {
  return paraglideMiddleware(
    new Request(`https://example.com/${alternate}/`),
    () => {
      expect(getLocale()).toBe(alternate)
      return read()
    }
  )
}

describe('llms.txt route', () => {
  it('publishes the same index inside and outside a localized request context', async () => {
    const baseResponse = await GET()
    const base = await baseResponse.text()

    const response = await inLocaleContext(() => GET())

    await expect(response.text()).resolves.toBe(base)
    expect(base).toContain(BASE_DESCRIPTION)
    expect(response.headers.get('content-type')).toBe(
      'text/markdown; charset=utf-8'
    )
    expect(response.headers.get('cache-control')).toBe(SITE_CACHE_CONTROL)
  })

  it('declares in the note the base locale in which the index is built', async () => {
    const response = await GET()

    await expect(response.text()).resolves.toContain(
      `This index uses ${INDEX_LANGUAGE}.`
    )
  })
})
