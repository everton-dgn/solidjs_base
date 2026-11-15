import type { RouteInfo } from '@solidjs/router'
import { Router } from '@testing/markdown/router.ts'
import { SITE } from '@testing/seo/site.ts'

import {
  PUBLICATION_PHASE_ENV,
  PUBLICATION_PRERENDER_PHASE
} from '#solid-runtime/infra/server/publication/protocol.js'

import { createLlms } from '../index.ts'

type MatchOptions = { pattern: string; info: RouteInfo }
const HTTP_OK = 200
const HTTP_SERVICE_UNAVAILABLE = 503
const FULL_LINK = `(${new URL('/llms-full.txt', SITE.url).href})`
let GET: ReturnType<typeof createLlms>
function matchEvery({ pattern, info }: MatchOptions): void {
  vi.spyOn(Router, 'match').mockImplementation(path => [
    { path, pattern, match: path, params: {}, info }
  ])
}

describe('llms publication', () => {
  beforeEach(() => {
    GET = createLlms({
      site: SITE,
      router: Router,
      pages: [
        {
          path: '/about',
          title: 'About',
          description: 'About the fixture',
          section: 'Pages',
          isOptional: false
        }
      ],
      fullPage: {
        path: '/llms-full.txt',
        title: 'Full Markdown of the static pages',
        description: 'Complete documents',
        section: 'Optional',
        isOptional: true
      }
    })
  })

  describe('build-time llms.txt', () => {
    it('fails small in production without rebuilding the index', async () => {
      vi.stubEnv('PROD', true)
      const log = vi.spyOn(console, 'error').mockReturnValue()
      const match = vi.spyOn(Router, 'match')
      const response = await GET()
      expect({
        status: response.status,
        cacheControl: response.headers.get('cache-control'),
        body: await response.text()
      }).toStrictEqual({
        status: HTTP_SERVICE_UNAVAILABLE,
        cacheControl: 'no-store',
        body: ''
      })
      expect(match).not.toHaveBeenCalled()
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(
          '[llms] Unexpected failure; private details omitted'
        )
      )
    })

    it('generates the index during prerender', async () => {
      vi.stubEnv('PROD', true)
      vi.stubEnv(PUBLICATION_PHASE_ENV, PUBLICATION_PRERENDER_PHASE)
      const response = await GET()
      expect(response.status).toBe(HTTP_OK)
    })
  })

  describe('llms-full.txt announcement', () => {
    it('announces the aggregate when the index includes static Markdown', async () => {
      matchEvery({ pattern: '/about', info: { markdown: true } })
      const response = await GET()
      const text = await response.text()
      expect(text).toContain('/de/about.md)')
      expect(text.match(/llms-full\.txt/gu)).toHaveLength(1)
      const optional = text.slice(text.indexOf('## Optional'))
      expect(optional).toContain(
        `- [Full Markdown of the static pages]${FULL_LINK}: `
      )
    })

    it.each([
      { pattern: '/about', info: { markdown: 'dynamic' } },
      { pattern: '/blog/:slug', info: { markdown: true } },
      { pattern: '/about', info: { markdown: true, seo: { noindex: true } } },
      { pattern: '/about', info: {} }
    ] satisfies MatchOptions[])(
      'omits the aggregate without static Markdown: $pattern $info',
      async options => {
        matchEvery(options)
        const response = await GET()
        await expect(response.text()).resolves.not.toContain(FULL_LINK)
      }
    )
  })
})
