import {
  createRouter,
  memoryHistory,
  type RouteDefinition
} from '@solidjs/router'
import { render } from '@solidjs/web'
import { POLL, readCanonical } from '@testing/seo/head-tags.ts'
import {
  parseStructuredData,
  type StructuredData
} from '@testing/seo/parse-structured-data.ts'
import { SITE, LOCALE_TAG_OVERRIDES } from '@testing/seo/site.ts'

import { renderComponent } from '@/tests/renderComponent/index.tsx'

import { createSeo } from '../index.ts'

type RenderAtOptions = {
  pathname: string
  routes?: readonly RouteDefinition[]
  // Signal that head tags have been applied; defaults to the route canonical.
  ready?: () => boolean
}

function readMeta(selector: string): string | null {
  return document.head.querySelector(selector)?.getAttribute('content') ?? null
}

function readStructuredData(): StructuredData | null {
  const script = document.head.querySelector(
    'script[type="application/ld+json"]'
  )
  return script?.textContent ? parseStructuredData(script.textContent) : null
}

// JSON-LD node order is irrelevant; find nodes by `@type`.
function readNode(type: string): StructuredData['@graph'][number] | undefined {
  return readStructuredData()?.['@graph'].find(node => node['@type'] === type)
}

// The head registry applies and removes tags in a microtask after effects.
async function renderAt({
  pathname,
  routes = [{ path: '/*rest', component: () => null }],
  ready = () => readCanonical() !== null
}: RenderAtOptions): Promise<string> {
  const Router = createRouter({
    routes,
    history: memoryHistory(pathname)
  })
  renderComponent(() => (
    <Router>
      {props => {
        createSeo({
          route: true,
          site: SITE,
          localeTagOverrides: LOCALE_TAG_OVERRIDES
        })
        return props.children
      }}
    </Router>
  ))
  await vi.waitUntil(ready, POLL)
  return SITE.url
}

describe('SEO head metadata', () => {
  it('publishes absolute canonical and og:url without the route query', async () => {
    const base = await renderAt({ pathname: '/docs?tab=2' })

    expect(readCanonical()).toBe(`${base}/de/docs`)
    expect(readMeta('meta[property="og:url"]')).toBe(`${base}/de/docs`)
  })

  it('publishes an absolute social image for Open Graph and Twitter', async () => {
    const base = await renderAt({ pathname: '/' })

    expect(readMeta('meta[property="og:image"]')).toBe(
      `${base}${SITE.image.path}`
    )
    expect(readMeta('meta[name="twitter:image"]')).toBe(
      `${base}${SITE.image.path}`
    )
  })

  it('describes image dimensions and alternative text', async () => {
    await renderAt({ pathname: '/' })

    expect(readMeta('meta[property="og:image:width"]')).toBe('1200')
    expect(readMeta('meta[property="og:image:height"]')).toBe('630')
    expect(readMeta('meta[property="og:image:alt"]')).toBe(SITE.image.alt)
    expect(readMeta('meta[name="twitter:image:alt"]')).toBe(SITE.image.alt)
  })

  it('publishes website og:type and page JSON-LD by default', async () => {
    const base = await renderAt({ pathname: '/' })

    expect(readMeta('meta[property="og:type"]')).toBe('website')
    expect([
      readMeta('meta[property="og:locale"]'),
      readMeta('meta[property="og:site_name"]'),
      readMeta('meta[name="twitter:card"]'),
      readMeta('meta[name="twitter:site"]'),
      readMeta('meta[name="twitter:creator"]')
    ]).toStrictEqual([
      'de_DE',
      SITE.title,
      'summary_large_image',
      SITE.twitter,
      SITE.author.twitter
    ])
    expect(readNode('WebSite')).toBeDefined()
    expect(readNode('WebPage')).toMatchObject({
      url: `${base}/de`,
      name: SITE.title
    })
  })

  it('uses the route image and type', async () => {
    const base = await renderAt({
      pathname: '/artigo',
      routes: [
        {
          path: '/artigo',
          info: {
            seo: {
              title: 'Artigo',
              type: 'article',
              image: { path: '/images/artigo.png', alt: 'Capa' }
            }
          },
          component: () => null
        }
      ]
    })

    expect(readMeta('meta[property="og:type"]')).toBe('article')
    expect([
      readMeta('meta[property="og:image"]'),
      readMeta('meta[name="twitter:image"]')
    ]).toStrictEqual([`${base}/images/artigo.png`, `${base}/images/artigo.png`])
    expect([
      readMeta('meta[property="og:image:alt"]'),
      readMeta('meta[name="twitter:image:alt"]')
    ]).toStrictEqual(['Capa', 'Capa'])
    expect([
      readMeta('meta[property="og:image:width"]'),
      readMeta('meta[property="article:published_time"]')
    ]).toStrictEqual(['1200', null])
    expect(readNode('Article')).toMatchObject({ headline: 'Artigo' })
  })

  it('removes tags on unmount and retains the root trailing slash', async () => {
    await vi.waitUntil(() => readCanonical() === null, POLL)
    const Router = createRouter({
      routes: [{ path: '/*rest', component: () => null }],
      history: memoryHistory('/')
    })
    const host = document.createElement('div')
    document.body.append(host)
    onTestFinished(() => host.remove())
    const dispose = render(
      () => (
        <Router>
          {props => {
            createSeo({
              route: true,
              site: SITE,
              localeTagOverrides: LOCALE_TAG_OVERRIDES
            })
            return props.children
          }}
        </Router>
      ),
      host
    )
    await vi.waitUntil(() => readCanonical() !== null, POLL)
    expect(readCanonical()).toBe(`${SITE.url}/de`)
    expect(readMeta('meta[property="og:url"]')).toBe(`${SITE.url}/de`)

    dispose()
    await vi.waitUntil(() => readCanonical() === null, POLL)
    expect(readMeta('meta[property="og:url"]')).toBeNull()
  })

  it('uses SITE metadata when the route has no SEO', async () => {
    await renderAt({ pathname: '/' })

    expect([
      document.title,
      readMeta('meta[property="og:title"]'),
      readMeta('meta[name="twitter:title"]')
    ]).toStrictEqual([SITE.title, SITE.title, SITE.title])
    expect([
      readMeta('meta[name="description"]'),
      readMeta('meta[property="og:description"]'),
      readMeta('meta[name="twitter:description"]')
    ]).toStrictEqual([SITE.description, SITE.description, SITE.description])
  })

  it('publishes child fields and inherits remaining layout fields', async () => {
    await renderAt({
      pathname: '/docs/guia',
      routes: [
        {
          path: '/docs',
          info: {
            seo: { title: 'Documentação', description: 'Guias do projeto.' }
          },
          children: [
            {
              path: '/guia',
              info: { seo: { title: 'Primeiros passos' } },
              component: () => null
            }
          ]
        }
      ]
    })

    expect([
      document.title,
      readMeta('meta[property="og:title"]'),
      readMeta('meta[name="twitter:title"]')
    ]).toStrictEqual([
      'Primeiros passos',
      'Primeiros passos',
      'Primeiros passos'
    ])
    expect([
      readMeta('meta[name="description"]'),
      readMeta('meta[property="og:description"]'),
      readMeta('meta[name="twitter:description"]')
    ]).toStrictEqual([
      'Guias do projeto.',
      'Guias do projeto.',
      'Guias do projeto.'
    ])
  })
})

describe('indexing and article Open Graph', () => {
  it('allows large image previews on indexable routes', async () => {
    await vi.waitUntil(() => readMeta('meta[name="robots"]') === null, POLL)
    await renderAt({ pathname: '/' })

    expect(readMeta('meta[name="robots"]')).toBe(
      'index, follow, max-image-preview:large'
    )
  })

  it('publishes article dates in Open Graph', async () => {
    await renderAt({
      pathname: '/artigo',
      routes: [
        {
          path: '/artigo',
          info: {
            seo: {
              type: 'article',
              article: {
                datePublished: '2026-09-01',
                dateModified: '2026-09-21'
              }
            }
          },
          component: () => null
        }
      ]
    })

    expect([
      readMeta('meta[property="article:published_time"]'),
      readMeta('meta[property="article:modified_time"]')
    ]).toStrictEqual(['2026-09-01', '2026-09-21'])
  })

  it('publishes only the declared article date', async () => {
    await vi.waitUntil(
      () => readMeta('meta[property="article:published_time"]') === null,
      POLL
    )
    await renderAt({
      pathname: '/artigo',
      routes: [
        {
          path: '/artigo',
          info: {
            seo: { type: 'article', article: { dateModified: '2026-09-21' } }
          },
          component: () => null
        }
      ]
    })

    expect([
      readMeta('meta[property="article:published_time"]'),
      readMeta('meta[property="article:modified_time"]')
    ]).toStrictEqual([null, '2026-09-21'])
  })

  it('omits article dates on noindex routes', async () => {
    await vi.waitUntil(() => readMeta('meta[name="robots"]') === null, POLL)
    await renderAt({
      pathname: '/rascunho',
      routes: [
        {
          path: '/rascunho',
          info: {
            seo: {
              type: 'article',
              noindex: true,
              article: { datePublished: '2026-09-01' }
            }
          },
          component: () => null
        }
      ],
      ready: () => readMeta('meta[name="robots"]') === 'noindex'
    })

    expect([
      readMeta('meta[property="article:published_time"]'),
      readMeta('meta[property="og:type"]')
    ]).toStrictEqual([null, null])
  })

  it('omits article dates on non-article pages', async () => {
    await vi.waitUntil(
      () => readMeta('meta[property="article:published_time"]') === null,
      POLL
    )
    await renderAt({
      pathname: '/guia',
      routes: [
        {
          path: '/guia',
          info: { seo: { article: { datePublished: '2026-09-01' } } },
          component: () => null
        }
      ]
    })

    expect(readMeta('meta[property="article:published_time"]')).toBeNull()
  })

  it('publishes only robots, title and description on noindex routes', async () => {
    await vi.waitUntil(() => readCanonical() === null, POLL)
    await renderAt({
      pathname: '/restrita',
      routes: [
        {
          path: '/restrita',
          info: {
            seo: {
              title: 'Área restrita',
              description: 'Conteúdo interno.',
              noindex: true
            }
          },
          component: () => null
        }
      ],
      ready: () => readMeta('meta[name="robots"]') !== null
    })

    expect([
      readMeta('meta[name="robots"]'),
      document.title,
      readMeta('meta[name="description"]')
    ]).toStrictEqual(['noindex', 'Área restrita', 'Conteúdo interno.'])
    expect([
      readCanonical(),
      readMeta('meta[property="og:type"]'),
      readMeta('meta[property="og:title"]'),
      readMeta('meta[property="og:url"]'),
      readMeta('meta[property="og:image"]'),
      readMeta('meta[name="twitter:title"]'),
      readMeta('meta[name="twitter:image"]'),
      readMeta('meta[name="twitter:site"]'),
      readStructuredData()
    ]).toStrictEqual([null, null, null, null, null, null, null, null, null])
  })
})
