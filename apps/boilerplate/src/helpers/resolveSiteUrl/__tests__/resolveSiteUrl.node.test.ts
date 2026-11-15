import type { resolveSiteUrl } from '../index.ts'

type ResolveSiteUrl = typeof resolveSiteUrl

// The URL does not depend on messages or locale, read lazily by SITE.
vi.mock(import('@paraglide/messages.js'), () => ({}))
vi.mock(import('@paraglide/runtime.js'), () => ({}))

// Mock the origin boundary to exercise URL resolution independently of config validation.
async function loadResolveSiteUrl(siteUrl: string): Promise<ResolveSiteUrl> {
  vi.resetModules()
  vi.doMock(import('@evertondgn/solid-runtime/seo/origin'), () => ({
    origin: siteUrl
  }))
  const reloaded = await import('../index.ts')
  return reloaded.resolveSiteUrl
}

describe('public URL resolution', () => {
  it('resolves paths against the site origin and retains the root trailing slash', async () => {
    const resolveSiteUrl = await loadResolveSiteUrl('https://example.com')

    expect(resolveSiteUrl('/docs')).toBe('https://example.com/docs')
    expect(resolveSiteUrl('/')).toBe('https://example.com/')
  })

  it('ignores the path and query of an injected base URL', async () => {
    const resolveSiteUrl = await loadResolveSiteUrl(
      'https://example.com/antigo?x=1'
    )

    expect(resolveSiteUrl('/sitemap.xml')).toBe(
      'https://example.com/sitemap.xml'
    )
  })
})
