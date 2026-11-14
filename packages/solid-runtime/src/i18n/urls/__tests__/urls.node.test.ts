import { delocalizePathname, localizeHref } from '../index.ts'

describe('localized URLs', () => {
  it('keeps the query and hash while changing locales', () => {
    expect(localizeHref({ href: '/fr/docs?q=1#section', locale: 'ja' })).toBe(
      '/ja/docs?q=1#section'
    )
    expect(localizeHref({ href: '/', locale: 'de' })).toBe('/de')
    expect(localizeHref({ href: '/ja', locale: 'fr' })).toBe('/fr')
  })

  it('leaves external URLs and fragments untouched', () => {
    for (const href of [
      'https://example.com/a',
      '//example.com/a',
      String.raw`/\example.com/a`,
      '/\t/example.com/a',
      'mailto:a@example.com',
      '#section'
    ]) {
      expect(localizeHref({ href, locale: 'ja' })).toBe(href)
    }
  })

  it('strips only a complete supported locale segment for route matching', () => {
    expect(delocalizePathname('/ja/docs')).toBe('/docs')
    expect(delocalizePathname('/fr')).toBe('/')
    expect(delocalizePathname('/enterprise')).toBe('/enterprise')
    expect(delocalizePathname('/unsupported/docs')).toBe('/unsupported/docs')
  })
})
