import { MARKDOWN_TIMEOUT_MS } from '@evertondgn/solid-runtime/server/publication-protocol'
import {
  createComponent,
  createRequestEvent,
  type RequestEvent,
  renderToStream,
  ssr
} from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'
import { createMemo, Loading, onCleanup } from 'solid-js'

import { HTTP_INTERNAL_SERVER_ERROR } from '@/constants/http.ts'
import { getPublicationMetrics } from '@/infra/server/publication/index.ts'
import { Router } from '@/router.ts'
import { readLog } from '@/tests/helpers/readLog/index.ts'

import { createMiddleware } from '../../index.ts'

type ComposedRender = (event: RequestEvent) => Promise<Response>
type ComposedOptions = { client: AbortController; render: ComposedRender }
type Cancellation = (client: AbortController) => Promise<void>
const LOG_MESSAGE = '[middleware] Unexpected failure; private details omitted'
const CANCELLATIONS: [string, Cancellation][] = [
  [
    'a client disconnect without a reason',
    client => {
      client.abort()
      return Promise.resolve()
    }
  ],
  [
    'a client disconnect with its own reason',
    client => {
      client.abort(new Error('PRIVATE_CLIENT'))
      return Promise.resolve()
    }
  ],
  [
    'the publication deadline',
    async () => {
      await vi.advanceTimersByTimeAsync(MARKDOWN_TIMEOUT_MS)
    }
  ]
]

function pendingPage(cleanup: () => void) {
  onCleanup(cleanup)
  return ssr(
    ['<main>', '</main>'],
    createComponent(Loading, {
      fallback: 'Waiting',
      get children() {
        const value = createMemo(() => Promise.withResolvers<string>().promise)
        return ssr(
          ['<p>', '</p>'],
          createMemo(() => value())
        )
      }
    })
  )
}

function startComposedMarkdown({
  client,
  render
}: ComposedOptions): Promise<Response> {
  vi.spyOn(Router, 'match').mockReturnValue([
    {
      path: '/about',
      pattern: '/about',
      match: '/about',
      params: {},
      info: { markdown: true }
    }
  ])
  const event = createRequestEvent(
    new Request('https://example.com/en/about.md', {
      signal: client.signal,
      headers: { accept: 'text/markdown' }
    })
  )
  return Promise.resolve(
    provideRequestEvent(event, () =>
      createMiddleware()(event, () => render(event))
    )
  )
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  const aborted = Promise.withResolvers<undefined>()
  signal.addEventListener('abort', () => aborted.resolve(void 0), {
    once: true
  })
  return aborted.promise
}

// A resposta do adaptador sai antes de a cadeia interna assentar; a vaga só é
// liberada depois dela, então a ausência de log não passa por adiantamento.
async function expectReleasedPublication(): Promise<void> {
  await vi.waitFor(() =>
    expect(getPublicationMetrics()).toMatchObject({
      active: 0,
      outputs: 0,
      reservedBytes: 0
    })
  )
}

describe('composed middleware cancellation', () => {
  beforeAll(async () => {
    await import('@/infra/server/configureServerErrors/index.ts')
  })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('DEV', false)
    vi.spyOn(console, 'error').mockImplementation(vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each(CANCELLATIONS)(
    'keeps the public response without a failure log after %s',
    async (_label, cancel) => {
      const client = new AbortController()
      const started = Promise.withResolvers<undefined>()
      const cleanup = vi.fn<() => void>()
      const pending = startComposedMarkdown({
        client,
        render: async event => {
          const rendered = renderToStream(() => pendingPage(cleanup), {
            signal: event.request.signal
          })
          started.resolve(void 0)
          return new Response(await rendered, {
            headers: { 'content-type': 'text/html' }
          })
        }
      })
      await started.promise

      await cancel(client)
      const response = await pending

      expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
      expect(response.headers.get('cache-control')).toContain('no-store')
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
      await expectReleasedPublication()
      expect(cleanup).toHaveBeenCalledOnce()
      expect(console.error).not.toHaveBeenCalled()
    }
  )

  it.each(CANCELLATIONS)(
    'logs a distinct failure raised during %s',
    async (_label, cancel) => {
      const client = new AbortController()
      const started = Promise.withResolvers<undefined>()
      const pending = startComposedMarkdown({
        client,
        render: async event => {
          started.resolve(void 0)
          await waitForAbort(event.request.signal)
          throw new TypeError('PRIVATE_DISTINCT')
        }
      })
      await started.promise

      await cancel(client)
      const response = await pending

      expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
      await expectReleasedPublication()
      expect(readLog(console.error)).toStrictEqual({
        heads: [[LOG_MESSAGE, 'TypeError']],
        leaks: []
      })
    }
  )
})
