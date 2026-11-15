import { markdownPrerender } from '@testing/markdown/prerender.ts'
import type { PrerenderRoute } from 'nitro/types'

import { createStaticMarkdownListing } from '../index.ts'

const BUILD_ID = 'NEW-TOOLING-BUILD'
type Handlers = {
  'prerender:init'?: () => void
  'prerender:routes'?: (routes: Set<string>) => void
  'prerender:generate'?: (route: PrerenderRoute) => void
  'prerender:done'?: (result: {
    prerenderedRoutes: PrerenderRoute[]
    failedRoutes: PrerenderRoute[]
  }) => Promise<void>
  compiled?: () => Promise<void>
}

describe('markdown publication identity', () => {
  it.each(['OLD-SSR-BUILD', '', undefined])(
    'rejects a Markdown-only inventory from SSR identity %j',
    async buildId => {
      vi.stubEnv('PUBLICATION_BUILD_ID', buildId)
      const listing = createStaticMarkdownListing({
        router: { match: () => [] },
        siteUrl: 'https://example.com',
        applySecurityHeaders: response => response
      })
      const route: PrerenderRoute = {
        route: '/_markdown/static.json',
        contents: await listing().text()
      }
      const handlers: Handlers = {}
      markdownPrerender({
        buildId: BUILD_ID,
        hasSitemap: false,
        hasLlms: false,
        hasLlmsFull: false
      })({
        options: {
          prerender: {},
          output: { dir: '/unused', publicDir: '/unused', serverDir: '/unused' }
        },
        hooks: {
          hook<Name extends keyof Handlers>(
            name: Name,
            handler: NonNullable<Handlers[Name]>
          ) {
            handlers[name] = handler
          }
        }
      })
      handlers['prerender:routes']?.(new Set())
      handlers['prerender:generate']?.(route)
      expect(route.error?.message).toMatch(/Markdown.*build identity/u)
    }
  )

  it('transports the SSR build identity in the Markdown inventory', async () => {
    vi.stubEnv('PUBLICATION_BUILD_ID', BUILD_ID)
    const listing = createStaticMarkdownListing({
      router: { match: () => [] },
      siteUrl: 'https://example.com',
      applySecurityHeaders: response => response
    })
    await expect(listing().json()).resolves.toMatchObject({ buildId: BUILD_ID })
  })
})
