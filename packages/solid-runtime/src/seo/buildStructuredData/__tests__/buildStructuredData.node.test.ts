import { parseStructuredData } from '@testing/seo/parse-structured-data.ts'
import { SITE, LOCALE_TAG_OVERRIDES } from '@testing/seo/site.ts'

import type { SeoMetadata } from '../../types.ts'
import { buildStructuredData } from '../index.ts'

const page: SeoMetadata = {
  title: 'Guia público',
  description: 'Conteúdo público do guia.',
  noindex: false,
  type: 'website',
  image: SITE.image
}

const organizationWithoutContact = {
  '@type': 'Organization',
  '@id': `${SITE.url}/#organization`,
  name: SITE.title,
  description: SITE.description,
  url: `${SITE.url}/`,
  logo: { '@type': 'ImageObject', url: `${SITE.url}${SITE.logo}` },
  sameAs: SITE.socialLinks
}

const organization = {
  ...organizationWithoutContact,
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'demo',
    email: 'contato@example.com',
    telephone: '0000000000',
    description:
      'Placeholder values for this boilerplate demonstration. Do not use them to contact the maintainer.'
  },
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Rua de exemplo, 123',
    addressLocality: 'Cidade de exemplo',
    addressRegion: 'Estado de exemplo',
    postalCode: '00000-000',
    addressCountry: 'BR',
    description: 'Placeholder address for this boilerplate demonstration.'
  }
}

describe('page structured data', () => {
  it('describes the site, page and publishing organization', () => {
    const graph = parseStructuredData(
      buildStructuredData({
        site: SITE,
        localeTagOverrides: LOCALE_TAG_OVERRIDES,
        seo: page,
        url: `${SITE.url}/guia`,
        image: `${SITE.url}${SITE.image.path}`
      })
    )

    expect(graph['@context']).toBe('https://schema.org')
    expect(graph['@graph']).toStrictEqual([
      {
        '@type': 'WebSite',
        '@id': `${SITE.url}/#website`,
        url: `${SITE.url}/`,
        name: SITE.title,
        description: SITE.description,
        inLanguage: ['fr-FR', 'de-DE', 'ja-JP'],
        publisher: { '@id': `${SITE.url}/#organization` }
      },
      {
        '@type': 'WebPage',
        '@id': `${SITE.url}/guia`,
        url: `${SITE.url}/guia`,
        name: 'Guia público',
        description: 'Conteúdo público do guia.',
        inLanguage: SITE.locale,
        isPartOf: { '@id': `${SITE.url}/#website` },
        image: {
          '@type': 'ImageObject',
          url: `${SITE.url}${SITE.image.path}`,
          caption: SITE.image.alt
        }
      },
      organization
    ])
  })

  it('omits unspecified contact information and address', () => {
    const { organization: configured } = SITE
    SITE.organization = {}
    try {
      const graph = parseStructuredData(
        buildStructuredData({
          site: SITE,
          localeTagOverrides: LOCALE_TAG_OVERRIDES,
          seo: page,
          url: `${SITE.url}/guia`,
          image: `${SITE.url}${SITE.image.path}`
        })
      )

      expect(graph['@graph'][2]).toStrictEqual(organizationWithoutContact)
    } finally {
      SITE.organization = configured
    }
  })

  it('publishes Article with headline, author and publisher', () => {
    const graph = parseStructuredData(
      buildStructuredData({
        site: SITE,
        localeTagOverrides: LOCALE_TAG_OVERRIDES,
        seo: { ...page, type: 'article', title: 'Artigo' },
        url: `${SITE.url}/artigo`,
        image: `${SITE.url}/images/artigo.png`
      })
    )
    const [, article] = graph['@graph']

    expect(article?.['@type']).toBe('Article')
    expect(article?.headline).toBe('Artigo')
    expect(article?.author).toStrictEqual({
      '@type': 'Person',
      name: SITE.author.name,
      url: SITE.author.url,
      sameAs: SITE.author.sameAs
    })
    expect(article?.publisher).toStrictEqual({
      '@id': `${SITE.url}/#organization`
    })
    expect('datePublished' in (article ?? {})).toBe(false)
  })

  it('publishes article dates declared by the route', () => {
    const graph = parseStructuredData(
      buildStructuredData({
        site: SITE,
        localeTagOverrides: LOCALE_TAG_OVERRIDES,
        seo: {
          ...page,
          type: 'article',
          article: { datePublished: '2026-09-01', dateModified: '2026-09-21' }
        },
        url: `${SITE.url}/artigo`,
        image: `${SITE.url}/images/artigo.png`
      })
    )
    const [, article] = graph['@graph']

    expect(article).toMatchObject({
      '@type': 'Article',
      datePublished: '2026-09-01',
      dateModified: '2026-09-21'
    })
  })

  it('ignores article dates on non-article pages', () => {
    const graph = parseStructuredData(
      buildStructuredData({
        site: SITE,
        localeTagOverrides: LOCALE_TAG_OVERRIDES,
        seo: { ...page, article: { datePublished: '2026-09-01' } },
        url: `${SITE.url}/guia`,
        image: `${SITE.url}${SITE.image.path}`
      })
    )

    expect('datePublished' in (graph['@graph'][1] ?? {})).toBe(false)
  })

  it('preserves HTML characters in JSON-serialized descriptions', () => {
    const json = buildStructuredData({
      site: SITE,
      localeTagOverrides: LOCALE_TAG_OVERRIDES,
      seo: { ...page, description: '</script><b>&</b>' },
      url: `${SITE.url}/`,
      image: `${SITE.url}${SITE.image.path}`
    })

    expect(parseStructuredData(json)['@graph'][1]?.description).toBe(
      '</script><b>&</b>'
    )
  })
})
