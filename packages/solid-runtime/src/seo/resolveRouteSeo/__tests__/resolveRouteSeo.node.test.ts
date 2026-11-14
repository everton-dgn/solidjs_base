import { SITE } from '@testing/seo/site.ts'

import { resolveRouteSeo } from '../index.ts'

describe('SEO metadata resolution through the route chain', () => {
  const defaults = {
    title: SITE.title,
    description: SITE.description,
    noindex: false,
    type: 'website',
    image: SITE.image
  }

  it('uses SITE defaults when no route declares metadata', () => {
    expect(resolveRouteSeo({ metadata: [], site: SITE })).toStrictEqual(
      defaults
    )
    expect(
      resolveRouteSeo({ metadata: [undefined, {}], site: SITE })
    ).toStrictEqual(defaults)
  })

  it('overrides each field from the outermost route to the innermost route', () => {
    const seo = resolveRouteSeo({
      metadata: [
        { title: 'Documentação', description: 'Guias do projeto.' },
        undefined,
        { title: 'Visão geral' },
        { noindex: true }
      ],
      site: SITE
    })

    expect(seo).toStrictEqual({
      ...defaults,
      title: 'Visão geral',
      description: 'Guias do projeto.',
      noindex: true
    })
  })

  it('inherits the layout type and merges image attributes', () => {
    const seo = resolveRouteSeo({
      metadata: [
        { type: 'article', image: { path: '/images/blog.png' } },
        { image: { alt: 'Capa do artigo' } }
      ],
      site: SITE
    })

    expect(seo.type).toBe('article')
    expect(seo.image).toStrictEqual({
      path: '/images/blog.png',
      width: SITE.image.width,
      height: SITE.image.height,
      alt: 'Capa do artigo'
    })
  })

  it('merges article dates and omits the key when none are declared', () => {
    const seo = resolveRouteSeo({
      metadata: [
        { type: 'article', article: { datePublished: '2026-09-01' } },
        { article: { dateModified: '2026-09-21', datePublished: undefined } }
      ],
      site: SITE
    })

    expect(seo.article).toStrictEqual({
      datePublished: '2026-09-01',
      dateModified: '2026-09-21'
    })
    expect(
      'article' in
        resolveRouteSeo({ metadata: [{ type: 'article' }], site: SITE })
    ).toBe(false)
  })

  it('does not share the SITE image object with the result', () => {
    const seo = resolveRouteSeo({ metadata: [], site: SITE })
    seo.image.alt = 'alterado'

    expect(SITE.image.alt).not.toBe('alterado')
  })

  it('allows a child route to restore indexing with noindex: false', () => {
    const seo = resolveRouteSeo({
      metadata: [{ noindex: true }, { noindex: false }],
      site: SITE
    })

    expect(seo.noindex).toBe(false)
  })

  it('preserves input objects', () => {
    const layout = { title: 'Layout' }
    const child = { description: 'Filha.' }

    resolveRouteSeo({ metadata: [layout, child], site: SITE })

    expect(layout).toStrictEqual({ title: 'Layout' })
    expect(child).toStrictEqual({ description: 'Filha.' })
  })
})
