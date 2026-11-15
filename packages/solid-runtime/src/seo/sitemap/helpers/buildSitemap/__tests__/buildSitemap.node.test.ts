import { buildSitemap } from '../index.ts'

const SITE_URL = 'https://example.com'

describe('geração do sitemap', () => {
  it('publica uma URL absoluta por entrada', () => {
    const sitemap = buildSitemap({
      siteUrl: SITE_URL,
      entries: [{ path: '/' }, { path: '/docs' }, { path: '/docs/guia' }]
    })

    const locations = [...sitemap.matchAll(/<loc>(?<url>[^<]+)<\/loc>/gu)].map(
      match => match.groups?.url
    )
    expect(locations).toStrictEqual([
      'https://example.com/fr',
      'https://example.com/de',
      'https://example.com/ja',
      'https://example.com/fr/docs',
      'https://example.com/de/docs',
      'https://example.com/ja/docs',
      'https://example.com/fr/docs/guia',
      'https://example.com/de/docs/guia',
      'https://example.com/ja/docs/guia'
    ])
    expect(sitemap).toContain(
      'hreflang="x-default" href="https://example.com/de"'
    )
  })

  it('publica lastmod só nas entradas que declaram a data', () => {
    const sitemap = buildSitemap({
      siteUrl: SITE_URL,
      entries: [{ path: '/artigo', lastmod: '2026-09-21' }, { path: '/' }]
    })

    expect(sitemap).toContain(
      '  <url><loc>https://example.com/fr/artigo</loc><lastmod>2026-09-21</lastmod>'
    )
    expect(sitemap).toContain(
      '  <url><loc>https://example.com/fr</loc><xhtml:link'
    )
  })

  it('publica um urlset vazio quando não há páginas estáticas', () => {
    const sitemap = buildSitemap({ siteUrl: SITE_URL, entries: [] })

    expect(sitemap).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
        '</urlset>',
        ''
      ].join('\n')
    )
  })

  it('escapa caracteres reservados do XML na URL e na data', () => {
    const sitemap = buildSitemap({
      siteUrl: SITE_URL,
      entries: [{ path: "/a&b'c", lastmod: '<2026>' }]
    })

    expect(sitemap).toContain(
      '<loc>https://example.com/fr/a&amp;b&apos;c</loc>'
    )
    expect(sitemap).toContain('<lastmod>&lt;2026&gt;</lastmod>')
  })

  it('deixa a URL codificar o que o parser já percent-encoda', () => {
    const sitemap = buildSitemap({
      siteUrl: SITE_URL,
      entries: [{ path: '/a<b>"c d' }]
    })

    expect(sitemap).toContain(
      '<loc>https://example.com/fr/a%3Cb%3E%22c%20d</loc>'
    )
  })

  it('escapa <, > e " que sobrevivem em URLs de caminho opaco', () => {
    const sitemap = buildSitemap({
      siteUrl: SITE_URL,
      entries: [{ path: 'data:text/plain,<x>"' }]
    })

    expect(sitemap).toContain('<loc>data:text/plain,&lt;x&gt;&quot;</loc>')
  })

  it('resolve caminhos absolutos contra a origem, ignorando o caminho do site', () => {
    const sitemap = buildSitemap({
      siteUrl: 'https://example.com/base/index.html?x=1',
      entries: [{ path: '/docs' }]
    })

    expect(sitemap).toContain('<loc>https://example.com/fr/docs</loc>')
  })
})
