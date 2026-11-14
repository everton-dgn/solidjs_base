import { resolveLocalizedHref } from '../index.ts'

describe('resolveLocalizedHref contracts', () => {
  it.each(['fr', 'de', 'ja'] as const)(
    'localizes a page into %s without an extension heuristic',
    locale => {
      expect(
        resolveLocalizedHref({ href: '/ja/manual.pdf?q=1#part', locale })
      ).toBe(`/${locale}/manual.pdf?q=1#part`)
    }
  )

  it.each([
    'https://example.com/docs',
    '//example.com/docs',
    String.raw`/\example.com/docs`,
    'mailto:a@example.com',
    'tel:123'
  ])('preserves external href %s', href => {
    expect(resolveLocalizedHref({ href, locale: 'ja' })).toBe(href)
  })

  it('requires a location for relative pages and supports query-only links', () => {
    expect(() =>
      resolveLocalizedHref({ href: '../docs', locale: 'de' })
    ).toThrow('requires a Router or base')
    const resolved = [
      resolveLocalizedHref({
        href: '?q=2#part',
        base: '/fr/docs?q=1',
        locale: 'de'
      }),
      resolveLocalizedHref({
        href: '#part',
        base: '/fr/docs?q=1',
        locale: 'de'
      })
    ]

    expect(resolved).toStrictEqual(['/de/docs?q=2#part', '/de/docs?q=1#part'])
  })

  it('bypasses endpoints and assets explicitly, including relative references', () => {
    for (const href of [
      '/api/report',
      '/images/logo',
      '../download',
      '?file=1'
    ]) {
      expect(
        resolveLocalizedHref({ href, shouldLocalize: false, locale: 'de' })
      ).toBe(href)
    }
  })
})
