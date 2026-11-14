import { createRequestEvent } from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'
import { endpoint } from 'virtual:solid-server-function-handler'

import { createLocalizeRequest } from '../../../middleware/createLocalizeRequest/index.ts'
import { createSecurityHeaders } from '../../../middleware/securityHeaders/index.ts'
import { localizedRedirect } from '../index.ts'

const localizeRequest = createLocalizeRequest(createSecurityHeaders())

type RedirectRequest = {
  href: string
  url?: string
  referer?: string
  shouldLocalize?: boolean
}

const ORIGIN = 'https://example.com'
type LocalizeOptions = { locale?: string }

const TEMPORARY_REDIRECT = 307

// Exercise the configured virtual endpoint.
vi.mock(import('virtual:solid-server-function-handler'), () => ({
  endpoint: '/rpc/execute'
}))

vi.mock(import('filesystem-routing/api'), async importOriginal => {
  const api = await importOriginal()
  return {
    ...api,
    createAPIMatcher: () =>
      api.createAPIMatcher([
        {
          path: '/robots.txt',
          $GET: { require: () => ({ GET: () => new Response('robots') }) }
        }
      ])
  }
})

function redirectRequest({
  href,
  url = `${ORIGIN}${endpoint}/save`,
  referer,
  shouldLocalize
}: RedirectRequest) {
  const request = new Request(url, {
    headers: referer ? { referer } : undefined
  })
  return provideRequestEvent(createRequestEvent(request), () =>
    localizeRequest({
      request,
      next: () =>
        Promise.resolve(
          localizedRedirect({
            href,
            shouldLocalize,
            locale: 'fr',
            status: TEMPORARY_REDIRECT,
            headers: { 'x-marker': 'kept' }
          })
        )
    })
  )
}

describe('relative localized redirects', () => {
  it.each([
    ['?saved=1', '/fr/docs/chapter?saved=1'],
    ['../next', '/fr/next'],
    ['#section', '/fr/docs/chapter?filter=active#section'],
    ['', '/fr/docs/chapter?filter=active']
  ])('uses the RPC page Referer for %s', async (href, expected) => {
    const response = await redirectRequest({
      href,
      referer: `${ORIGIN}/fr/docs/chapter?filter=active`
    })
    expect(response.headers.get('location')).toBe(expected)
    expect(response.status).toBe(TEMPORARY_REDIRECT)
    expect(response.headers.get('x-marker')).toBe('kept')
  })

  it.each([
    undefined,
    'not a URL',
    'https://other.example/fr/docs',
    `${ORIGIN}${endpoint}/other`,
    `${ORIGIN}/robots.txt`
  ])('rejects an unsafe RPC page base %s', async referer => {
    await expect(
      redirectRequest({ href: '?saved=1', referer })
    ).rejects.toThrow('safe page base')
  })

  it.each(['#section', ''])(
    'rejects %s without a safe RPC page base',
    async href => {
      await expect(redirectRequest({ href })).rejects.toThrow('safe page base')
    }
  )

  it('ignores Referer for a page request and for an endpoint lookalike', async () => {
    const page = await redirectRequest({
      url: `${ORIGIN}/fr/docs/chapter?filter=active`,
      referer: `${ORIGIN}/fr/other`,
      href: '#section'
    })
    expect(page.headers.get('location')).toBe(
      '/fr/docs/chapter?filter=active#section'
    )
    const lookalike = await redirectRequest({
      url: `${ORIGIN}/fr${endpoint}-guide/chapter`,
      referer: `${ORIGIN}/fr/other`,
      href: '?saved=1'
    })
    expect(lookalike.headers.get('location')).toBe(
      `/fr${endpoint}-guide/chapter?saved=1`
    )
  })

  it('keeps root-relative, external and explicit endpoint redirects independent of Referer', async () => {
    const root = await redirectRequest({ href: '/docs' })
    const external = await redirectRequest({
      href: 'https://other.example/docs?q=1#part'
    })
    const endpointRedirect = await redirectRequest({
      href: '?saved=1',
      shouldLocalize: false
    })
    expect(root.headers.get('location')).toBe('/fr/docs')
    expect(external.headers.get('location')).toBe(
      'https://other.example/docs?q=1#part'
    )
    expect(endpointRedirect.headers.get('location')).toBe('?saved=1')
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
