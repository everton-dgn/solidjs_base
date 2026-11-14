import { hasMarkdownOptIn, isMarkdownRoute, markdownPath } from '../index.ts'

describe('markdown derived from HTML', () => {
  it('requires leaf opt-in and indexable SEO', () => {
    expect(isMarkdownRoute([{ markdown: true }, {}])).toBe(false)
    expect(
      isMarkdownRoute([{ seo: { noindex: true } }, { markdown: true }])
    ).toBe(false)
    expect(
      isMarkdownRoute([
        { seo: { noindex: true } },
        { markdown: true, seo: { noindex: false } }
      ])
    ).toBe(true)
    expect(isMarkdownRoute([{ markdown: true, seo: { noindex: true } }])).toBe(
      false
    )
  })

  it('publishes dynamic pages under the same SEO rule', () => {
    expect(isMarkdownRoute([{ markdown: 'dynamic' }])).toBe(true)
    expect(
      isMarkdownRoute([{ markdown: 'dynamic', seo: { noindex: true } }])
    ).toBe(false)
    expect(isMarkdownRoute([{ markdown: false }])).toBe(false)
  })

  it('reads leaf opt-in without resolving SEO', () => {
    expect(hasMarkdownOptIn([{ markdown: true, seo: { noindex: true } }])).toBe(
      true
    )
    expect(hasMarkdownOptIn([{ markdown: 'dynamic' }])).toBe(true)
    expect(hasMarkdownOptIn([{ markdown: true }, {}])).toBe(false)
    expect(hasMarkdownOptIn([{ markdown: false }])).toBe(false)
    expect(hasMarkdownOptIn([])).toBe(false)
  })

  it.each([
    ['/', '/index.md'],
    ['/fr', '/fr/index.md'],
    ['/de/', '/de/index.md'],
    ['/index', '/index/index.md'],
    ['/index/index', '/index/index/index.md'],
    ['/foo/index', '/foo/index/index.md'],
    ['/fr/index', '/fr/index/index.md'],
    ['/de/index/', '/de/index/index.md'],
    ['/ja/foo/index', '/ja/foo/index/index.md'],
    ['/fr/index/index', '/fr/index/index/index.md'],
    ['/ja/about', '/ja/about.md'],
    ['/fr/blog/article', '/fr/blog/article.md']
  ])('maps %s to %s', (path, expected) => {
    expect(markdownPath(path)).toBe(expected)
  })
})
