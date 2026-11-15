import { createStaticMarkdownListing } from '../index.ts'

vi.mock(import('virtual:solid-app/locale'), () => ({
  baseLocale: 'en',
  locales: ['en'],
  getLocale: () => 'en',
  setLocale: vi.fn<() => void>(),
  extractLocaleFromUrl() {
    // Single-language URLs have no locale segment.
  },
  localizeHref: (href: string) => href,
  deLocalizeUrl: (url: string | { readonly href: string }) =>
    new URL(typeof url === 'string' ? url : url.href)
}))
vi.mock(import('virtual:file-routes'), () => ({
  default: [],
  pageRoutes: ['/', '/about'].map(path => ({
    id: path,
    path,
    page: true,
    $$route: { require: () => ({ route: { info: { markdown: true } } }) }
  }))
}))

describe('single-language Markdown listing', () => {
  it('includes unprefixed documents in the effective base locale without i18n', async () => {
    vi.stubEnv('PUBLICATION_BUILD_ID', 'single-language-build')
    const listing = createStaticMarkdownListing({
      router: { match: path => [{ pattern: path, info: { markdown: true } }] },
      siteUrl: 'https://example.com',
      applySecurityHeaders: response => response
    })
    await expect(listing().json()).resolves.toStrictEqual({
      buildId: 'single-language-build',
      siteUrl: 'https://example.com/',
      baseLocale: 'en',
      paths: ['/index.md', '/about.md'],
      baseLocalePaths: ['/index.md', '/about.md'],
      mismatches: []
    })
  })
})
