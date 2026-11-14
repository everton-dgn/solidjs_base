import { cookieMaxAge, getLocale } from '@paraglide/runtime.js'
import { createRequestEvent } from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'
import { endpoint } from 'virtual:solid-server-function-handler'

import { createSecurityHeaders } from '../../securityHeaders/index.ts'
import { createLocalizeRequest } from '../index.ts'

const localizeRequest = createLocalizeRequest(createSecurityHeaders())

type PageOptions = {
  path?: string
  headers?: HeadersInit
  responseHeaders?: HeadersInit
  origin?: string
}

const ORIGIN = 'https://example.com'
const HTTP_REDIRECT = 307

function renderPage({
  path = '/',
  headers,
  responseHeaders,
  origin = ORIGIN
}: PageOptions = {}): Promise<Response> {
  const request = new Request(new URL(path, origin), { headers })
  return provideRequestEvent(createRequestEvent(request), () =>
    localizeRequest({
      request,
      next: () =>
        Promise.resolve(new Response(getLocale(), { headers: responseHeaders }))
    })
  )
}

describe('locale negotiation and persistence', () => {
  it.each([
    ['', 'de'],
    ['ko-KR', 'de'],
    ['ja;q=0, ko;q=1', 'de'],
    ['ja;q=0.000, fr;q=0', 'de'],
    ['ja;q=NaN, fr;q=0.5', 'fr'],
    ['ja;q=2, fr;q=0.5', 'fr'],
    ['ja;q=-1, fr;q=0.5', 'fr'],
    ['ja;q=0.1234, fr;q=0.5', 'fr'],
    ['JA-jp ; Q = 0, fr-FR ; q = 0.4', 'fr'],
    ['fr-BR;q=0.3, ja-AR;q=0.8, de;q=0', 'ja']
  ])('negotiates %j as %s', async (acceptLanguage, locale) => {
    const response = await renderPage({
      headers: { 'accept-language': acceptLanguage, cookie: 'locale=invalid' }
    })
    expect(response.status).toBe(HTTP_REDIRECT)
    expect(response.headers.get('location')).toBe(`${ORIGIN}/${locale}`)
  })

  it('keeps an explicit URL and cookie ahead of the language header', async () => {
    const headers = {
      cookie: 'locale=ja',
      'accept-language': 'fr;q=0, ja;q=0, de'
    }
    const page = await renderPage({ path: '/fr', headers })
    await expect(page.text()).resolves.toBe('fr')
    const redirect = await renderPage({ headers })
    expect(redirect.headers.get('location')).toBe(`${ORIGIN}/ja`)
  })

  it('persists the negotiated redirect without sharing it through caches', async () => {
    const response = await renderPage({
      path: '/?campaign=example',
      headers: { 'accept-language': 'ja-AR' }
    })
    expect(response.headers.get('location')).toBe(
      `${ORIGIN}/ja?campaign=example`
    )
    expect(response.headers.getSetCookie()).toStrictEqual([
      `locale=ja; Path=/; Max-Age=${cookieMaxAge}; Secure; SameSite=Lax`
    ])
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('vary')).toContain('Cookie')
    expect(response.headers.get('vary')).toContain('Accept-Language')
  })

  it('saves the page locale while retaining other cookies and Vary values', async () => {
    const response = await renderPage({
      path: '/ja',
      headers: { cookie: 'locale=fr' },
      responseHeaders: {
        'set-cookie': 'theme=dark; Path=/',
        vary: 'Accept-Encoding',
        'cache-control': 'public, s-maxage=3600'
      }
    })
    expect(response.headers.getSetCookie()).toStrictEqual([
      'theme=dark; Path=/',
      `locale=ja; Path=/; Max-Age=${cookieMaxAge}; Secure; SameSite=Lax`
    ])
    expect(response.headers.get('vary')).toBe('Accept-Encoding, Cookie')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('content-language')).toBe('ja')
    await expect(response.text()).resolves.toBe('ja')
  })

  it('does not rewrite a matching preference and preserves wildcard Vary', async () => {
    const response = await renderPage({
      path: '/ja',
      headers: { cookie: 'locale=ja' },
      responseHeaders: { vary: '*', 'cache-control': 'private, max-age=60' }
    })
    expect(response.headers.getSetCookie()).toStrictEqual([])
    expect(response.headers.get('vary')).toBe('*')
    expect(response.headers.get('cache-control')).toBe('private, max-age=60')
  })

  it('avoids duplicate Vary fields and permits cookies on local HTTP', async () => {
    const response = await renderPage({
      path: '/de',
      origin: 'http://localhost',
      responseHeaders: { vary: 'accept-encoding, cookie' }
    })
    expect(response.headers.get('vary')).toBe('accept-encoding, cookie')
    expect(response.headers.getSetCookie()).toStrictEqual([
      `locale=de; Path=/; Max-Age=${cookieMaxAge}; SameSite=Lax`
    ])
  })

  it('normalizes server function detection without changing its POST or persisting its locale', async () => {
    const request = new Request(`${ORIGIN}${endpoint}/save`, {
      method: 'POST',
      headers: { 'accept-language': 'ja;q=0, ko', cookie: 'locale=invalid' },
      body: 'original-body'
    })
    const response = await provideRequestEvent(
      createRequestEvent(request),
      () =>
        localizeRequest({
          request,
          next: async () =>
            new Response(`${getLocale()}:${await request.text()}`)
        })
    )
    await expect(response.text()).resolves.toBe('de:original-body')
    expect(request.headers.get('accept-language')).toBe('ja;q=0, ko')
    expect(response.headers.getSetCookie()).toStrictEqual([])
  })
})
