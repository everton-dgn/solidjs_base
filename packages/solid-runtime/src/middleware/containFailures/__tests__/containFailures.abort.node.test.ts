import {
  createComponent,
  createRequestEvent,
  type RequestEvent,
  renderToStream,
  ssr
} from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'
import { readLog } from '@testing/readLog/index.ts'
import { createMemo, Loading, onCleanup } from 'solid-js'

import { createSecurityHeaders } from '../../securityHeaders/index.ts'
import { containFailures } from '../index.ts'

type PageRequest = { client: AbortController; event: RequestEvent }
type NativeRender = {
  cleanup: () => void
  complete: () => void
  render: () => Promise<Response>
  started: PromiseWithResolvers<undefined>
}

const { applySecurityHeaders } = createSecurityHeaders()

const TEST_ORIGIN = 'http://localhost'
const HTTP_FOUND = 302
const HTTP_INTERNAL_SERVER_ERROR = 500
const PUBLIC_MESSAGE = 'The request could not be completed.'
const LOG_MESSAGE = '[middleware] Unexpected failure; private details omitted'
const ERROR_PAGE_LOG =
  '[error-page] Unexpected failure; private details omitted'
const CANCELLATIONS: [string, unknown][] = [
  ['disconnection without an explicit reason', undefined],
  ['disconnection with a custom reason', new Error('PRIVATE_CLIENT')],
  ['publication deadline', new Error('PRIVATE_DEADLINE')],
  ['a non-Error reason', { quiet: true }],
  ['null', null],
  ['false', false],
  ['zero', 0],
  ['empty string', ''],
  ['NaN', Number.NaN],
  ['negative zero', -0]
]

function pageRequest(): PageRequest {
  const client = new AbortController()
  const request = new Request(TEST_ORIGIN, {
    signal: client.signal,
    headers: { accept: 'text/html' }
  })
  return { client, event: createRequestEvent(request) }
}

function failingWith(value: unknown) {
  const fail = vi.fn<() => Promise<Response>>().mockRejectedValue(value)
  return containFailures({ chain: [fail], applySecurityHeaders })
}

function renderPage() {
  return vi.fn<() => Promise<Response>>().mockResolvedValue(
    new Response('<main>Algo deu errado!</main>', {
      headers: { 'content-type': 'text/html; charset=utf-8' }
    })
  )
}

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

// The plugin async render awaits the renderToStream thenable.
function nativeRender(event: RequestEvent): NativeRender {
  const cleanup = vi.fn<() => void>()
  const complete = vi.fn<() => void>()
  const started = Promise.withResolvers<undefined>()
  const render = vi
    .fn<() => Promise<Response>>()
    .mockImplementation(async () => {
      const rendered = renderToStream(() => pendingPage(cleanup), {
        signal: event.request.signal,
        onCompleteAll: complete
      })
      started.resolve(void 0)
      return new Response(await rendered, {
        headers: { 'content-type': 'text/html' }
      })
    })
  return { cleanup, complete, render, started }
}

function mockProductionLog(): void {
  vi.stubEnv('DEV', false)
  vi.spyOn(console, 'error').mockImplementation(vi.fn())
}

describe('expected request cancellation', () => {
  beforeEach(mockProductionLog)

  it.each(CANCELLATIONS)(
    'returns a public 500 without logging or rendering for %s',
    async (_label, reason) => {
      const { client, event } = pageRequest()
      client.abort(reason)
      const render = renderPage()

      const response = await provideRequestEvent(event, () =>
        failingWith(event.request.signal.reason)(event.request, render)
      )

      expect(render).not.toHaveBeenCalled()
      expect({
        status: response.status,
        text: await response.text()
      }).toStrictEqual({
        status: HTTP_INTERNAL_SERVER_ERROR,
        text: PUBLIC_MESSAGE
      })
      expect(Object.fromEntries(response.headers)).toMatchObject({
        'content-type': 'text/plain; charset=utf-8',
        'x-content-type-options': 'nosniff'
      })
      expect(response.headers.get('content-security-policy')).toContain(
        "script-src 'none'"
      )
      expect(console.error).not.toHaveBeenCalled()
    }
  )

  it.each(CANCELLATIONS)(
    'does not log native SSR abandonment for %s',
    async (_label, reason) => {
      const { client, event } = pageRequest()
      const { cleanup, complete, render, started } = nativeRender(event)
      const pending = provideRequestEvent(event, () =>
        containFailures({ chain: [], applySecurityHeaders })(
          event.request,
          render
        )
      )
      await started.promise

      client.abort(reason)
      const response = await pending

      expect(render).toHaveBeenCalledOnce()
      expect(cleanup).toHaveBeenCalledOnce()
      expect(complete).not.toHaveBeenCalled()
      expect({
        status: response.status,
        text: await response.text()
      }).toStrictEqual({
        status: HTTP_INTERNAL_SERVER_ERROR,
        text: PUBLIC_MESSAGE
      })
      expect(console.error).not.toHaveBeenCalled()
    }
  )

  it('preserves a control Response thrown during cancellation', async () => {
    const { client, event } = pageRequest()
    client.abort()
    const control = Response.redirect(new URL('/', TEST_ORIGIN), HTTP_FOUND)

    const response = await provideRequestEvent(event, () =>
      failingWith(control)(event.request, renderPage())
    )

    expect(response.status).toBe(HTTP_FOUND)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(console.error).not.toHaveBeenCalled()
  })

  it('rethrows cancellation in development', async () => {
    vi.stubEnv('DEV', true)
    const { client, event } = pageRequest()
    client.abort()
    const reason: unknown = event.request.signal.reason

    await expect(failingWith(reason)(event.request, renderPage())).rejects.toBe(
      reason
    )
    expect(console.error).not.toHaveBeenCalled()
  })
})

describe('real failures during cancellation', () => {
  beforeEach(mockProductionLog)

  it.each([
    ['a regular error', () => new TypeError('PRIVATE'), 'TypeError'],
    [
      'an AbortError from another signal',
      () => new DOMException('PRIVATE', 'AbortError'),
      'DOMException'
    ],
    [
      'an error wrapping the reason',
      (reason: unknown) => new Error('PRIVATE', { cause: reason }),
      'Error'
    ]
  ])(
    'logs %s thrown after the signal aborts',
    async (_label, createFailure, className) => {
      const { client, event } = pageRequest()
      client.abort(new Error('PRIVATE_CLIENT'))
      const failure = createFailure(event.request.signal.reason)

      const response = await provideRequestEvent(event, () =>
        failingWith(failure)(event.request, renderPage())
      )

      expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
      expect(readLog(console.error)).toStrictEqual({
        heads: [[LOG_MESSAGE, className]],
        leaks: []
      })
    }
  )

  // An active signal has an undefined reason; throwing undefined is still a failure.
  it('logs undefined thrown while the signal is active', async () => {
    const { event } = pageRequest()

    const response = await provideRequestEvent(event, () =>
      failingWith(event.request.signal.reason)(event.request, renderPage())
    )

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE]],
      leaks: []
    })
  })

  it.each([
    ['before the error page', true],
    ['during the error page', false]
  ])(
    'keeps only the original failure log with cancellation %s',
    async (_label, shouldAbortFirst) => {
      const { client, event } = pageRequest()
      const { render, started } = nativeRender(event)
      const reason = new Error('PRIVATE_CLIENT')
      if (shouldAbortFirst) client.abort(reason)

      const pending = provideRequestEvent(event, () =>
        failingWith(new TypeError('PRIVATE'))(event.request, render)
      )
      await started.promise
      client.abort(reason)
      const response = await pending

      expect(render).toHaveBeenCalledOnce()
      expect({
        status: response.status,
        text: await response.text()
      }).toStrictEqual({
        status: HTTP_INTERNAL_SERVER_ERROR,
        text: PUBLIC_MESSAGE
      })
      expect(readLog(console.error)).toStrictEqual({
        heads: [[LOG_MESSAGE, 'TypeError']],
        leaks: []
      })
    }
  )

  it('logs a different error from the cancelled error render', async () => {
    const { client, event } = pageRequest()
    const render = vi.fn<() => Promise<Response>>().mockImplementation(() => {
      client.abort(new Error('PRIVATE_CLIENT'))
      return Promise.reject(new RangeError('PRIVATE_RENDER'))
    })

    const response = await provideRequestEvent(event, () =>
      failingWith(new TypeError('PRIVATE'))(event.request, render)
    )

    await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
    expect(readLog(console.error)).toStrictEqual({
      heads: [
        [LOG_MESSAGE, 'TypeError'],
        [ERROR_PAGE_LOG, 'RangeError']
      ],
      leaks: []
    })
  })
})
