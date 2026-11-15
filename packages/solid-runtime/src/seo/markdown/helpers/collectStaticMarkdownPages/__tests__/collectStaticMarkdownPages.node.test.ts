import type { RouteInfo } from '@solidjs/router'

import type { StaticRoute } from '#solid-runtime/routing/walkStaticRoutes/types.ts'

import { collectStaticMarkdownPages } from '../index.ts'

type PageOptions = { path: string; info?: RouteInfo; children?: StaticRoute[] }

function page({ path, info, children }: PageOptions): StaticRoute {
  return {
    path,
    page: !children,
    $$route: { require: () => ({ route: { info } }) },
    children
  }
}

describe('static Markdown page collection', () => {
  it('collects build-time pages in every locale', () => {
    const routes = [
      page({ path: '/', info: { markdown: true } }),
      page({ path: '/about', info: { markdown: true } }),
      page({ path: '/blog', info: { markdown: 'dynamic' } }),
      page({ path: '/posts/:slug', info: { markdown: true } }),
      page({ path: '/account', info: { markdown: false } }),
      page({ path: '/terms' }),
      page({
        path: '/docs',
        children: [page({ path: '/', info: { markdown: true } })]
      })
    ]
    expect(collectStaticMarkdownPages(routes)).toStrictEqual([
      '/fr',
      '/de',
      '/ja',
      '/fr/about',
      '/de/about',
      '/ja/about',
      '/fr/docs',
      '/de/docs',
      '/ja/docs'
    ])
  })
})
