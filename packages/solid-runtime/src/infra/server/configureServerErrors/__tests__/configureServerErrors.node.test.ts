import {
  configureServerErrors,
  createRequestEvent,
  redirect,
  respond,
  type RequestEvent,
  type RequestEventLocals,
  type ServerErrorHook
} from '@solidjs/web'
import {
  configureServerFunctionsServer,
  type WrapInvocationHook
} from '@solidjs/web/server-functions/server'
import { hostileValue, throwValue } from '@testing/failureValues/index.ts'
import { readLog } from '@testing/readLog/index.ts'
import { NotReadyError } from 'solid-js'

import type {
  createPublicError,
  isPublicError
} from '../../publicErrors/index.ts'
import type { createRenderIntegrity } from '../../renderIntegrity/index.ts'

vi.mock(import('@solidjs/web'), async importOriginal => ({
  ...(await importOriginal()),
  configureServerErrors: vi.fn<typeof configureServerErrors>()
}))
vi.mock(import('@solidjs/web/server-functions/server'), () => ({
  configureServerFunctionsServer: vi.fn<typeof configureServerFunctionsServer>()
}))

// Without a publicMessage callback, the runtime uses the English default.
const PUBLIC_MESSAGE = 'The request could not be completed.'
const LOG_MESSAGE = '[server-error] Unexpected failure; private details omitted'
const HTTP_NOT_FOUND = 404

type PublicErrors = {
  createPublicError: typeof createPublicError
  isPublicError: typeof isPublicError
}

type RenderState = NonNullable<RequestEventLocals['ssrRenderState']>
type RenderProbe = { event: RequestEvent; state: RenderState }
type CreateRenderIntegrity = typeof createRenderIntegrity

// The wrapper only needs run; Solid owns construction of its invocation context.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Only the Solid runtime constructs ServerFunctionEvent.
const context = {} as Parameters<WrapInvocationHook>[1]
// These fields identify where the failure occurred.
const site: Parameters<ServerErrorHook>[1] = {
  kind: 'render',
  handling: 'fallback'
}

function invoke(wrap: WrapInvocationHook, run: () => unknown): unknown {
  try {
    return wrap(run, context)
  } catch (error) {
    return error
  }
}

function logUnavailable(): never {
  throw new Error('stderr unavailable')
}

function registeredHook(): ServerErrorHook {
  const [errors] = vi.mocked(configureServerErrors).mock.lastCall ?? []
  const hook = errors?.onError
  if (!hook) throw new Error('onError was not registered')
  return hook
}

// The factory must come from the same module instance as the reloaded hook.
function renderProbe(createIntegrity: CreateRenderIntegrity): RenderProbe {
  const event = createRequestEvent(new Request('http://localhost/'))
  const { state } = createIntegrity()
  event.locals.ssrRenderState = state
  return { event, state }
}

async function loadRegistration() {
  vi.resetModules()
  vi.mocked(configureServerErrors).mockClear()
  vi.mocked(configureServerFunctionsServer).mockClear()
  const { configureServerErrors: configure } = await import('../index.ts')
  configure()
}

describe('central error policy registration', () => {
  let config: Parameters<typeof configureServerFunctionsServer>[0]
  let wrap: WrapInvocationHook
  let onError: ServerErrorHook
  // The public error factory must share the reloaded hook module instance.
  let publicErrors: PublicErrors
  let createIntegrity: CreateRenderIntegrity

  beforeAll(async () => {
    vi.stubEnv('DEV', false)
    await loadRegistration()
    const [registered] =
      vi.mocked(configureServerFunctionsServer).mock.calls[0] ?? []
    if (!registered?.wrapInvocation) {
      throw new Error('wrapInvocation was not registered')
    }
    config = registered
    wrap = registered.wrapInvocation
    onError = registeredHook()
    publicErrors = await import('../../publicErrors/index.ts')
    ;({ createRenderIntegrity: createIntegrity } =
      await import('../../renderIntegrity/index.ts'))
  })
  // unstubEnvs resets the beforeAll stub before each case; that stub only
  // sets the mode captured while loading the registration.
  beforeEach(() => {
    vi.stubEnv('DEV', false)
    vi.spyOn(console, 'error').mockImplementation(vi.fn())
  })

  it('registers only wrapInvocation and preserves control signals', () => {
    expect(Object.keys(config ?? {})).toStrictEqual(['wrapInvocation'])
    const control = redirect('/')
    expect(invoke(wrap, () => throwValue(control))).toBe(control)
    const envelope = respond({ ok: true })
    expect(invoke(wrap, () => envelope)).toMatchObject({ value: { ok: true } })
  })

  it('replaces unexpected failures with public errors and filtered logs', () => {
    const failure = invoke(wrap, () => throwValue(new Error('PRIVATE')))
    expect(failure).toBeInstanceOf(Error)
    expect(failure).toHaveProperty('message', PUBLIC_MESSAGE)
    expect(readLog(console.error)).toStrictEqual({
      heads: [
        [
          '[server-operation] Unexpected failure; private details omitted',
          'Error'
        ]
      ],
      leaks: []
    })
  })

  it('leaves control signals to the runtime default policy', () => {
    for (const control of [
      redirect('/'),
      respond({ ok: true }),
      new NotReadyError(Promise.resolve('ready'))
    ]) {
      expect(onError(control, site)).toBeUndefined()
    }
    expect(console.error).not.toHaveBeenCalled()
  })

  it.each([
    ['an Error', new Error('PRIVATE', { cause: 'CAUSE_PRIVATE' }), ['Error']],
    ['a primitive', 'PRIVATE', []],
    ['a Response with a body', new Response('PRIVATE'), []],
    ['a Response.error() with status 0', Response.error(), []],
    ['an object whose inspection fails', hostileValue(), []]
  ])(
    'replaces %s with a new public error and filtered log',
    (_label, failure, details) => {
      const mapped = onError(failure, site)

      // Strict Error equality checks message, cause and properties.
      expect(mapped).toStrictEqual(new Error(PUBLIC_MESSAGE))
      expect(publicErrors.isPublicError(mapped)).toBe(true)
      expect(readLog(console.error)).toStrictEqual({
        heads: [[LOG_MESSAGE, ...details]],
        leaks: []
      })
    }
  )

  it('recreates a public error without duplicate logging', () => {
    const tampered = Object.assign(publicErrors.createPublicError(), {
      cause: 'CAUSE_PRIVATE',
      internalContext: 'PRIVATE'
    })

    const mapped = onError(tampered, { ...site, handling: 'failed' })

    expect(mapped).not.toBe(tampered)
    expect(mapped).toStrictEqual(new Error(PUBLIC_MESSAGE))
    expect(console.error).not.toHaveBeenCalled()
  })

  // The second attempt logs only the fixed line, without the error.
  it('logs the fixed line even when the first attempt fails', () => {
    vi.mocked(console.error).mockImplementationOnce(() => {
      throw new Error('stderr unavailable')
    })

    const mapped = onError(new Error('PRIVATE'), site)

    expect(mapped).toStrictEqual(new Error(PUBLIC_MESSAGE))
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error'], [LOG_MESSAGE]],
      leaks: []
    })
  })

  it('returns a public error even without a log destination', () => {
    // Both attempts fail, then the spy returns to normal for Vitest itself.
    vi.mocked(console.error)
      .mockImplementationOnce(logUnavailable)
      .mockImplementationOnce(logUnavailable)

    const mapped = onError(new Error('PRIVATE'), site)

    expect(mapped).toStrictEqual(new Error(PUBLIC_MESSAGE))
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error'], [LOG_MESSAGE]],
      leaks: []
    })
  })

  it('marks render state only for render failures', () => {
    const { event, state } = renderProbe(createIntegrity)

    onError(new Error('PRIVATE'), {
      kind: 'server-function',
      handling: 'thrown',
      event
    })
    expect(state.hasErrors).toBe(false)
    onError(new Error('PRIVATE'), { ...site, event })
    expect(state.hasErrors).toBe(true)
  })

  it.each([
    ['a redirect()', redirect('/')],
    ['a respond()', respond({ ok: true }, { status: HTTP_NOT_FOUND })]
  ])('also marks render state for %s', (_name, control) => {
    const { event, state } = renderProbe(createIntegrity)

    expect(onError(control, { ...site, event })).toBeUndefined()
    expect(state.hasErrors).toBe(true)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('installs the hook in development and prints the original error', async () => {
    vi.stubEnv('DEV', true)
    await loadRegistration()
    const { createRenderIntegrity: createFresh } =
      await import('../../renderIntegrity/index.ts')
    const { event, state } = renderProbe(createFresh)
    const failure = new Error('PRIVATE')

    expect(registeredHook()(failure, { ...site, event })).toBeUndefined()
    expect(state.hasErrors).toBe(true)
    // The original follows the filtered line only in development.
    expect(readLog(console.error).heads[0]).toStrictEqual([
      LOG_MESSAGE,
      'Error'
    ])
    expect(vi.mocked(console.error).mock.calls.slice(1)).toStrictEqual([
      [failure]
    ])
    expect(configureServerFunctionsServer).toHaveBeenCalledOnce()
  })
})
