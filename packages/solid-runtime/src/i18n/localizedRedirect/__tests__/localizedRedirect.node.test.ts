import { paraglideMiddleware } from '@paraglide/server.js'
import { HREF } from '@solidjs/web'

import { localizedRedirect } from '../index.ts'

type LocalizeOptions = { locale?: string }

const TEMPORARY_REDIRECT = 307
const FOUND = 302

function redirectRequest(locale: string) {
  return paraglideMiddleware(
    new Request('https://example.com/', {
      headers: { 'accept-language': locale }
    }),
    async () => {
      await Promise.resolve()
      return localizedRedirect({ href: '/docs' })
    }
  )
}

describe('localizedRedirect contracts', () => {
  it('returns a Solid redirect Response preserving status, headers and revalidation', () => {
    const response = localizedRedirect({
      href: '/fr/docs?q=1#part',
      locale: 'ja',
      status: TEMPORARY_REDIRECT,
      headers: { 'x-test': 'kept' },
      revalidate: ['docs']
    })
    expect(response).toBeInstanceOf(Response)
    expect(response.status).toBe(TEMPORARY_REDIRECT)
    expect(response.headers.get('location')).toBe('/ja/docs?q=1#part')
    expect(response.headers.get('x-test')).toBe('kept')
    expect(response.headers.get('x-revalidate')).toBe('docs')
  })

  it('preserves external targets and explicit endpoints, with the default status', () => {
    expect(
      localizedRedirect({ href: 'https://example.com' }).headers.get('location')
    ).toBe('https://example.com')
    const response = localizedRedirect({
      href: '/api/report',
      shouldLocalize: false
    })
    expect(response.headers.get('location')).toBe('/api/report')
    expect(response.status).toBe(FOUND)
    expect(response.body).toBeNull()
  })

  it('honors the logical Href brand used by Solid redirects', () => {
    const href = { [HREF]: '/docs', toString: () => '#/docs' }
    expect(
      localizedRedirect({ href, locale: 'de' }).headers.get('location')
    ).toBe('/de/docs')
  })

  it('uses isolated request locales, including Accept-Language without an explicit locale', async () => {
    const responses = await Promise.all(
      ['ja', 'de'].map(locale => redirectRequest(locale))
    )
    expect(
      responses.map(response => response.headers.get('location'))
    ).toStrictEqual(['/ja/docs', '/de/docs'])
  })
})

vi.mock(import('virtual:solid-app/locale'), async () => {
  const runtime = await import('@paraglide/runtime.js')
  return {
    locales: runtime.locales,
    baseLocale: runtime.baseLocale,
    getLocale: runtime.getLocale,
    extractLocaleFromUrl: runtime.extractLocaleFromUrl,
    deLocalizeUrl: runtime.deLocalizeUrl,
    localizeHref(href: string, options?: LocalizeOptions) {
      return runtime.localizeHref(href, {
        locale: runtime.isLocale(options?.locale) ? options.locale : undefined
      })
    }
  }
})
