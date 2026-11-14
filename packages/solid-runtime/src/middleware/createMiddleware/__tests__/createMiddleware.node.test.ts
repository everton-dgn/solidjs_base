import { getLocale, shouldRedirect } from '@paraglide/runtime.js'
import { createRequestEvent, type RequestEvent } from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'
import { readLog } from '@testing/readLog/index.ts'

import { configureServerErrors } from '../../../infra/server/configureServerErrors/index.ts'
import { isPublicError } from '../../../infra/server/publicErrors/index.ts'
import { createSecurityHeaders } from '../../securityHeaders/index.ts'
import type { Middleware, StartMiddleware } from '../../types.ts'
import { createMiddleware } from '../index.ts'

vi.mock(import('@paraglide/runtime.js'), { spy: true })
vi.mock(import('@/i18n/locale/index.ts'), async () => {
  const runtime = await import('@paraglide/runtime.js')
  return { getLocale: () => runtime.getLocale() }
})
vi.mock(import('virtual:file-routes'), () => ({
  default: [
    {
      path: '/api',
      $GET: { require: () => ({ GET: () => new Response('api') }) }
    }
  ]
}))

const security = createSecurityHeaders({
  headers: { 'x-application-policy': 'configured' }
})
const LOG_MESSAGE = '[middleware] Unexpected failure; private details omitted'

const HTTP_INTERNAL_SERVER_ERROR = 500
const HTTP_TEMPORARY_REDIRECT = 307

function pageEvent(path = '/fr/page'): RequestEvent {
  return createRequestEvent(new Request(`http://localhost${path}`))
}

describe('runtime middleware chain', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false)
    vi.spyOn(console, 'error').mockImplementation(vi.fn())
    configureServerErrors({
      publicMessage: locale => `Public failure: ${locale}`
    })
  })

  it('applies the configured security policy and nonce before a terminating API', async () => {
    const event = pageEvent('/api')
    const next = vi.fn<() => Promise<Response>>()
    const middleware = createMiddleware({ security })
    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(next).not.toHaveBeenCalled()
    await expect(response.text()).resolves.toBe('api')
    expect(event.nonce).toBeTypeOf('string')
    expect(response.headers.get('x-application-policy')).toBe('configured')
    expect(response.headers.get('content-security-policy')).toContain(
      "script-src 'none'"
    )
  })

  it('runs extra steps before security and keeps inner failure rendering in the locale', async () => {
    const event = pageEvent()
    const extra: Middleware = () => {
      expect(event.nonce).toBeUndefined()
      return Promise.reject(new Error('PRIVATE_CHAIN'))
    }
    const next = vi.fn<() => Promise<Response>>().mockImplementation(() => {
      expect(getLocale()).toBe('fr')
      expect(isPublicError(event.locals.serverFailure)).toBe(true)
      expect(event.nonce).toBeDefined()
      return Promise.resolve(
        new Response(event.locals.serverFailure?.message, {
          headers: { 'content-type': 'text/html' }
        })
      )
    })
    const middleware = createMiddleware({ security, extra: [extra] })
    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(next).toHaveBeenCalledExactlyOnceWith()
    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    await expect(response.text()).resolves.toBe('Public failure: fr')
    expect(Object.fromEntries(response.headers)).toMatchObject({
      'content-language': 'fr',
      'x-application-policy': 'configured'
    })
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error']],
      leaks: []
    })
  })

  it('contains failures of locale resolution outside the inner chain', async () => {
    vi.mocked(shouldRedirect).mockRejectedValueOnce(new Error('PRIVATE_LOCALE'))
    const event = pageEvent()
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(
      new Response('public fallback', {
        headers: { 'content-type': 'text/html' }
      })
    )
    const middleware = createMiddleware({ security })
    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(next).toHaveBeenCalledExactlyOnceWith()
    expect({
      status: response.status,
      message: event.locals.serverFailure?.message
    }).toStrictEqual({
      status: HTTP_INTERNAL_SERVER_ERROR,
      message: 'Public failure: de'
    })
    expect(response.headers.get('x-application-policy')).toBe('configured')
    await expect(response.text()).resolves.toBe('public fallback')
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error']],
      leaks: []
    })
  })

  it('preserves locale redirects without invoking the application chain', async () => {
    const event = pageEvent('/')
    const next = vi.fn<() => Promise<Response>>()
    const extra = vi.fn<Middleware>()
    const middleware = createMiddleware({ security, extra: [extra] })
    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(response.status).toBe(HTTP_TEMPORARY_REDIRECT)
    expect(response.headers.get('location')).toBe('http://localhost/de')
    expect(response.headers.get('x-application-policy')).toBe('configured')
    expect(extra).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it('localizes the fallback after a document failure before next', async () => {
    const event = pageEvent()
    const document = vi
      .fn<StartMiddleware>()
      .mockRejectedValue(new Error('PRIVATE_DOCUMENT'))
    const next = vi.fn<() => Promise<Response>>().mockImplementation(() => {
      expect(getLocale()).toBe('fr')
      return Promise.resolve(
        new Response(getLocale(), { headers: { 'content-type': 'text/html' } })
      )
    })
    const middleware = createMiddleware({ security, document })
    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    expect(next).toHaveBeenCalledExactlyOnceWith()
    expect(event.locals.serverFailure?.message).toBe('Public failure: de')
    await expect(response.text()).resolves.toBe('fr')
    expect(response.headers.get('x-application-policy')).toBe('configured')
  })

  it('passes document request replacements to the localized render', async () => {
    const event = pageEvent('/fr/alias')
    const destination = 'http://localhost/ja/page'
    const document: StartMiddleware = (current, next) => {
      current.request = new Request(destination)
      return next()
    }
    const next = vi.fn<() => Promise<Response>>().mockImplementation(() => {
      expect(event.request.url).toBe('http://localhost/ja/page')
      return Promise.resolve(new Response(getLocale()))
    })
    const response = await provideRequestEvent(event, () =>
      createMiddleware({ security, document })(event, next)
    )
    await expect(response.text()).resolves.toBe('ja')
    expect(next).toHaveBeenCalledExactlyOnceWith()
  })

  it('never repeats rendering after a document failure after next', async () => {
    const event = pageEvent()
    const failure = new Error('PRIVATE_AFTER')
    const document: StartMiddleware = async (_event, proceed) => {
      await proceed()
      throw failure
    }
    const next = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValue(new Response('public page'))
    const response = await provideRequestEvent(event, () =>
      createMiddleware({ security, document })(event, next)
    )
    expect(next).toHaveBeenCalledExactlyOnceWith()
    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    await expect(response.text()).resolves.toBe('Public failure: de')
    expect(response.headers.get('x-application-policy')).toBe('configured')
  })

  it('rethrows the original failure in development', async () => {
    vi.stubEnv('DEV', true)
    const event = pageEvent()
    const error = new Error('PRIVATE_DEV')
    const extra: Middleware = () => Promise.reject(error)
    const next = vi.fn<() => Promise<Response>>()
    await expect(
      provideRequestEvent(event, () =>
        createMiddleware({ security, extra: [extra] })(event, next)
      )
    ).rejects.toBe(error)
    expect(console.error).not.toHaveBeenCalled()
  })
})
