import { UNSAFE_JSON_LD_TEXT } from '@testing/seo/hostile-text.ts'
import { parseStructuredData } from '@testing/seo/parse-structured-data.ts'
import { SITE } from '@testing/seo/site.ts'

import type { SeoSite } from '../../types.ts'
import { buildStructuredData } from '../index.ts'

const minimal: SeoSite = {
  title: 'Minimal site',
  description: 'Minimal description',
  url: SITE.url,
  locale: 'fr',
  image: SITE.image
}

function graph(site: SeoSite): string {
  return buildStructuredData({
    site,
    seo: {
      title: site.title,
      description: site.description,
      noindex: false,
      type: 'article',
      image: site.image
    },
    url: `${site.url}/article`,
    image: `${site.url}/image.png`
  })
}

describe('optional editorial fields', () => {
  it('omits organization, publisher and author without adding example identities', () => {
    const nodes = parseStructuredData(graph(minimal))['@graph']
    expect(nodes.map(node => node['@type'])).toStrictEqual([
      'WebSite',
      'Article'
    ])
    expect(nodes[0]).not.toHaveProperty('publisher')
    expect(nodes[1]).not.toHaveProperty('publisher')
    expect(nodes[1]).not.toHaveProperty('author')
  })

  it('keeps organization without a logo, contact information or social profiles', () => {
    const nodes = parseStructuredData(graph({ ...minimal, organization: {} }))[
      '@graph'
    ]
    expect(nodes[2]).toStrictEqual({
      '@type': 'Organization',
      '@id': `${SITE.url}/#organization`,
      name: minimal.title,
      description: minimal.description,
      url: `${SITE.url}/`
    })
    expect(nodes[1]?.publisher).toStrictEqual({
      '@id': `${SITE.url}/#organization`
    })
  })

  it('accepts an author with only a name and no organization', () => {
    const nodes = parseStructuredData(
      graph({ ...minimal, author: { name: 'Writer' } })
    )['@graph']
    expect(nodes[1]?.author).toStrictEqual({
      '@type': 'Person',
      name: 'Writer'
    })
    expect(nodes[1]).not.toHaveProperty('publisher')
  })

  it('escapes hostile site values before publishing and preserves their JSON values', () => {
    const json = graph({
      ...minimal,
      title: UNSAFE_JSON_LD_TEXT,
      description: UNSAFE_JSON_LD_TEXT,
      author: { name: UNSAFE_JSON_LD_TEXT },
      organization: {}
    })
    expect(json).not.toMatch(/[<\u2028\u2029]/u)
    const nodes = parseStructuredData(json)['@graph']
    expect(nodes[0]?.name).toBe(UNSAFE_JSON_LD_TEXT)
    expect(nodes[1]?.author).toStrictEqual({
      '@type': 'Person',
      name: UNSAFE_JSON_LD_TEXT
    })
    expect(nodes[2]?.description).toBe(UNSAFE_JSON_LD_TEXT)
  })
})
