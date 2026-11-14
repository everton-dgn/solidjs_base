import { buildLocaleAlternates } from '../index.ts'

describe('locale alternates', () => {
  it('lists every locale and points x-default to the base locale', () => {
    expect(
      buildLocaleAlternates({
        href: '/docs?q=1#section',
        siteUrl: 'https://example.com'
      })
    ).toStrictEqual([
      { hreflang: 'fr', href: 'https://example.com/fr/docs?q=1#section' },
      { hreflang: 'de', href: 'https://example.com/de/docs?q=1#section' },
      { hreflang: 'ja', href: 'https://example.com/ja/docs?q=1#section' },
      { hreflang: 'x-default', href: 'https://example.com/de/docs?q=1#section' }
    ])
  })

  it('relocalizes a path that already has a locale prefix', () => {
    const alternates = buildLocaleAlternates({
      href: '/ja/docs',
      siteUrl: 'https://example.com'
    })

    expect(alternates.map(({ href }) => href)).toStrictEqual([
      'https://example.com/fr/docs',
      'https://example.com/de/docs',
      'https://example.com/ja/docs',
      'https://example.com/de/docs'
    ])
  })

  it('resolves root-relative paths against the site origin', () => {
    const [alternate] = buildLocaleAlternates({
      href: '/docs',
      siteUrl: 'https://example.com/base/index.html?x=1'
    })

    expect(alternate?.href).toBe('https://example.com/fr/docs')
  })
})
