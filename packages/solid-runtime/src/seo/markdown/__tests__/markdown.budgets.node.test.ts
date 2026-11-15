import { createRequestEvent } from '@solidjs/web'

import { createPublicationController } from '../../../infra/server/publication/index.ts'
import { createMarkdownContent } from '../index.ts'

const { markdown } = vi.hoisted(() => ({
  markdown: {
    static: false,
    hasLlms: false,
    maxInputBytes: 100,
    maxOutputBytes: 100,
    timeoutMs: 25
  }
}))
vi.mock(import('virtual:solid-app/seo-markdown'), () => ({ markdown }))

const HTTP_OK = 200
const HTTP_ERROR = 500
const HTTP_UNAVAILABLE = 503
const INPUT = '<main>é</main>'
const INPUT_BYTES = new TextEncoder().encode(INPUT).byteLength
const OUTPUT_BYTES = new TextEncoder().encode('é').byteLength

function event(signal?: AbortSignal) {
  const request = createRequestEvent(
    new Request('https://example.com/de/about.md', { signal })
  )
  request.locals.ssrRenderState = { hasCompleted: true, hasErrors: false }
  return request
}

function html(): Response {
  return new Response(INPUT, { headers: { 'content-type': 'text/html' } })
}

function setup() {
  const publication = createPublicationController({ markdown: 1 })
  const service = createMarkdownContent({
    publication,
    router: { match: () => [{ pattern: '/about', info: { markdown: true } }] },
    siteUrl: 'https://example.com',
    applySecurityHeaders: response => response
  })
  return { publication, service }
}

describe('markdown resource budgets', () => {
  beforeEach(() => {
    markdown.maxInputBytes = INPUT_BYTES
    markdown.maxOutputBytes = OUTPUT_BYTES
    vi.spyOn(console, 'error').mockReturnValue()
  })

  it.each([0, 1])(
    'checks the UTF-8 input at the limit and %s byte above it',
    async excess => {
      markdown.maxInputBytes = INPUT_BYTES - excess
      const { service } = setup()
      const response = await service(event(), () => Promise.resolve(html()))
      expect(INPUT_BYTES).toBeGreaterThan(INPUT.length)
      expect(response.status).toBe(excess === 0 ? HTTP_OK : HTTP_ERROR)
      const body = await response.text()
      expect(excess === 0 ? body : response.headers.get('cache-control')).toBe(
        excess === 0 ? 'é' : 'private, no-store'
      )
    }
  )

  it.each([0, 1])(
    'checks the UTF-8 output at the limit and %s byte above it',
    async excess => {
      markdown.maxOutputBytes = OUTPUT_BYTES - excess
      const { service } = setup()
      const response = await service(event(), () => Promise.resolve(html()))
      expect(OUTPUT_BYTES).toBeGreaterThan('é'.length)
      expect(response.status).toBe(excess === 0 ? HTTP_OK : HTTP_ERROR)
      const body = await response.text()
      expect(excess === 0 ? body : response.headers.get('cache-control')).toBe(
        excess === 0 ? 'é' : 'private, no-store'
      )
    }
  )

  it.each(['client', 'deadline'])(
    'retains capacity after %s cancellation until the producer settles',
    async cause => {
      vi.useFakeTimers()
      const producer = Promise.withResolvers<Response>()
      const client = new AbortController()
      const { publication, service } = setup()
      const request = event(client.signal)
      const pending = service(request, () => producer.promise)
      try {
        if (cause === 'client') client.abort()
        else await vi.advanceTimersByTimeAsync(markdown.timeoutMs)
        const failed = await pending
        expect({
          status: failed.status,
          aborted: request.request.signal.aborted,
          active: publication.getMetrics().active
        }).toStrictEqual({ status: HTTP_ERROR, aborted: true, active: 1 })
        const render = vi.fn<() => Promise<Response>>()
        const refused = await service(event(), render)
        expect(refused.status).toBe(HTTP_UNAVAILABLE)
        expect(render).not.toHaveBeenCalled()
        producer.resolve(html())
        await vi.advanceTimersByTimeAsync(0)
        expect(publication.getMetrics()).toMatchObject({
          active: 0,
          outputs: 0,
          reservedBytes: 0
        })
        const recovered = await service(event(), () => Promise.resolve(html()))
        expect({
          status: recovered.status,
          body: await recovered.text()
        }).toStrictEqual({ status: HTTP_OK, body: 'é' })
      } finally {
        producer.resolve(html())
        await vi.advanceTimersByTimeAsync(0)
        vi.useRealTimers()
      }
    }
  )
})
