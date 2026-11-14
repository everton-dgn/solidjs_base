import { SITE } from '@testing/seo/site.ts'

import type { StaticRoute } from '#solid-runtime/routing/walkStaticRoutes/types.ts'

import { collectLlmsPages } from '../index.ts'

type ReadRouteModule = NonNullable<StaticRoute['$$route']>['require']

describe('collecting selected llms.txt pages', () => {
  it('inherits layout fields and prefers the index child at the same URL', () => {
    const preload = vi.fn<() => void>()
    const pages = collectLlmsPages({
      site: SITE,
      routes: [
        {
          path: '/docs',
          page: true,
          $$route: {
            require: () => ({
              route: {
                preload,
                info: {
                  seo: {
                    title: 'Documentação',
                    description: 'Guias do projeto.'
                  },
                  llms: { section: 'Guias' }
                }
              }
            })
          },
          children: [
            {
              path: '/',
              page: true,
              $$route: {
                require: () => ({
                  route: {
                    info: { seo: { title: 'Visão geral' }, llms: true }
                  }
                })
              }
            },
            {
              path: '/guia',
              page: true,
              $$route: {
                require: () => ({
                  route: { info: { llms: { optional: true } } }
                })
              }
            }
          ]
        }
      ]
    })

    expect(pages).toStrictEqual([
      {
        path: '/docs',
        title: 'Visão geral',
        description: 'Guias do projeto.',
        section: 'Guias',
        isOptional: false
      },
      {
        path: '/docs/guia',
        title: 'Documentação',
        description: 'Guias do projeto.',
        section: 'Guias',
        isOptional: true
      }
    ])
    expect(preload).not.toHaveBeenCalled()
  })

  it('excludes pages without opt-in, APIs and dynamic branches and falls back to SITE', () => {
    const readDynamicRoute = vi.fn<ReadRouteModule>()
    const pages = collectLlmsPages({
      site: SITE,
      routes: [
        {
          path: '/',
          page: true,
          $$route: { require: () => ({ route: { info: { llms: true } } }) }
        },
        { path: '/about', page: true },
        {
          path: '/api/health',
          $$route: { require: () => ({ route: { info: { llms: true } } }) }
        },
        { path: '/*404', page: true },
        {
          path: '/users/:id',
          page: true,
          $$route: { require: readDynamicRoute },
          children: [{ path: '/profile', page: true }]
        }
      ]
    })

    expect(pages).toStrictEqual([
      {
        path: '/',
        title: SITE.title,
        description: SITE.description,
        section: 'Pages',
        isOptional: false
      }
    ])
    expect(readDynamicRoute).not.toHaveBeenCalled()
  })
})

describe('llms.txt selection inheritance through route chains', () => {
  it('excludes inherited noindex and llms false and allows child reactivation', () => {
    const pages = collectLlmsPages({
      site: SITE,
      routes: [
        {
          path: '/account',
          page: true,
          $$route: {
            require: () => ({
              route: { info: { seo: { noindex: true }, llms: true } }
            })
          },
          children: [
            { path: '/settings', page: true },
            {
              path: '/public',
              page: true,
              $$route: {
                require: () => ({
                  route: { info: { seo: { noindex: false } } }
                })
              }
            }
          ]
        },
        {
          path: '/docs',
          page: true,
          $$route: {
            require: () => ({ route: { info: { llms: true } } })
          },
          children: [
            {
              path: '/internal',
              page: true,
              $$route: {
                require: () => ({ route: { info: { llms: false } } })
              }
            }
          ]
        }
      ]
    })

    expect(pages.map(page => page.path)).toStrictEqual([
      '/account/public',
      '/docs'
    ])
  })

  it('reactivates with true preserving the section and inherits all fields with an empty object', () => {
    const pages = collectLlmsPages({
      site: SITE,
      routes: [
        {
          path: '/guias',
          page: true,
          $$route: {
            require: () => ({
              route: { info: { llms: { section: 'Guias', optional: true } } }
            })
          },
          children: [
            {
              path: '/rascunho',
              page: true,
              $$route: {
                require: () => ({ route: { info: { llms: false } } })
              },
              children: [
                {
                  path: '/publicado',
                  page: true,
                  $$route: {
                    require: () => ({ route: { info: { llms: true } } })
                  }
                }
              ]
            },
            {
              path: '/herdado',
              page: true,
              $$route: { require: () => ({ route: { info: { llms: {} } } }) }
            }
          ]
        }
      ]
    })

    expect(
      pages.map(page => [page.path, page.section, page.isOptional])
    ).toStrictEqual([
      ['/guias', 'Guias', true],
      ['/guias/rascunho/publicado', 'Guias', true],
      ['/guias/herdado', 'Guias', true]
    ])
  })

  it('overrides only the section and optional flag declared by the child', () => {
    const pages = collectLlmsPages({
      site: SITE,
      routes: [
        {
          path: '/guias',
          page: true,
          $$route: {
            require: () => ({
              route: { info: { llms: { section: 'Guias', optional: true } } }
            })
          },
          children: [
            {
              path: '/referencia',
              page: true,
              $$route: {
                require: () => ({
                  route: { info: { llms: { section: 'Referência' } } }
                })
              }
            },
            {
              path: '/essencial',
              page: true,
              $$route: {
                require: () => ({
                  route: { info: { llms: { optional: false } } }
                })
              }
            }
          ]
        }
      ]
    })

    expect(
      pages.map(page => [page.path, page.section, page.isOptional])
    ).toStrictEqual([
      ['/guias', 'Guias', true],
      ['/guias/referencia', 'Referência', true],
      ['/guias/essencial', 'Guias', false]
    ])
  })

  it('applies index-child noindex after resolving the shared URL', () => {
    const pages = collectLlmsPages({
      site: SITE,
      routes: [
        {
          path: '/docs',
          page: true,
          $$route: {
            require: () => ({ route: { info: { llms: true } } })
          },
          children: [
            {
              path: '/',
              page: true,
              $$route: {
                require: () => ({ route: { info: { seo: { noindex: true } } } })
              }
            },
            { path: '/guide', page: true }
          ]
        }
      ]
    })

    expect(pages.map(page => page.path)).toStrictEqual(['/docs/guide'])
  })

  it('excludes the shared URL when the index child declares llms false', () => {
    const pages = collectLlmsPages({
      site: SITE,
      routes: [
        {
          path: '/docs',
          page: true,
          $$route: {
            require: () => ({ route: { info: { llms: true } } })
          },
          children: [
            {
              path: '/',
              page: true,
              $$route: {
                require: () => ({ route: { info: { llms: false } } })
              }
            },
            { path: '/guide', page: true }
          ]
        }
      ]
    })

    expect(pages.map(page => page.path)).toStrictEqual(['/docs/guide'])
  })
})
