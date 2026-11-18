import { m } from '@paraglide/messages.js'
import { baseLocale, getLocale } from '@paraglide/runtime.js'
import { paraglideMiddleware } from '@paraglide/server.js'

import { SITE_CACHE_CONTROL } from '@/constants/cache.ts'

import { GET } from '../index.ts'

const BASE_DESCRIPTION = m.site_description({}, { locale: 'en' })
const PORTUGUESE_DESCRIPTION = m.site_description({}, { locale: 'pt' })
const INDEX_LANGUAGE =
  new Intl.DisplayNames(['en'], { type: 'language' }).of(baseLocale) ??
  baseLocale

// Context of a request in Portuguese, like the one of a localized page.
function inPortuguese(read: () => Promise<Response>): Promise<Response> {
  return paraglideMiddleware(new Request('https://example.com/pt/'), () => {
    expect(getLocale()).toBe('pt')
    return read()
  })
}

describe('llms.txt route', () => {
  it('publishes the same index inside and outside a Portuguese context', async () => {
    const baseResponse = await GET()
    const base = await baseResponse.text()

    const response = await inPortuguese(() => GET())

    await expect(response.text()).resolves.toBe(base)
    expect(base).toContain(BASE_DESCRIPTION)
    expect(base).not.toContain(PORTUGUESE_DESCRIPTION)
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
