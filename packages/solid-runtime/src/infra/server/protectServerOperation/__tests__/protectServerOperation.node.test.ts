import { isResponseEnvelope, redirect, reload, respond } from '@solidjs/web'
import { throwValue } from '@testing/failureValues/index.ts'
import { readLog } from '@testing/readLog/index.ts'
import { NotReadyError } from 'solid-js'

import { createPublicError } from '../../publicErrors/index.ts'
import { protectInvocation as protectServerOperation } from '../registration/index.ts'

type Invocation = { run: () => unknown; allowControl?: boolean }
type CyclicData = { self?: CyclicData }
type VisitCount = { visits: number }
type CountedNode = { node: object; count: VisitCount }

const HTTP_CREATED = 201
const HTTP_NO_CONTENT = 204
const HTTP_RESET_CONTENT = 205
const HTTP_NOT_MODIFIED = 304
const DIAMOND_DEPTH = 16
const REJECTED_SHAPES = 4
const LOG_MESSAGE =
  '[server-operation] Unexpected failure; private details omitted'
// Without a publicMessage callback, the runtime uses the English default.
const PUBLIC_MESSAGE = 'The request could not be completed.'

function thrownValue(invocation: Invocation): unknown {
  try {
    protectServerOperation(invocation)
  } catch (error) {
    return error
  }
  throw new Error('Expected operation to throw')
}

// Counts key enumeration independently of machine speed.
function countedNode({ node, count }: CountedNode): object {
  return new Proxy(node, {
    ownKeys(target) {
      count.visits += 1
      return Reflect.ownKeys(target)
    }
  })
}

function logUnavailable(): never {
  throw new Error('stderr unavailable')
}

function expectPublicFailure(error: unknown): void {
  expect(error).toBeInstanceOf(Error)
  if (!(error instanceof Error)) throw new TypeError('Expected Error')
  expect(error.message).toBe(PUBLIC_MESSAGE)
  expect(error.cause).toBeUndefined()
  expect(Object.keys(error)).toStrictEqual([])
  expect(Object.getOwnPropertyNames(error).toSorted()).toStrictEqual([
    'message',
    'stack'
  ])
}

// Vitest defaults to DEV; these cases check production logging.
function mockProductionLog(): void {
  vi.stubEnv('DEV', false)
  vi.spyOn(console, 'error').mockImplementation(vi.fn())
}

describe('server operation protection', () => {
  beforeEach(mockProductionLog)

  it('preserves synchronous returns and removes exception details', () => {
    const data = { ok: true }
    expect(protectServerOperation({ run: () => data })).toBe(data)
    const internal = Object.assign(
      new Error('PRIVATE_MESSAGE', { cause: 'PRIVATE_CAUSE' }),
      {
        internalContext: 'PRIVATE_CONTEXT'
      }
    )
    const error = thrownValue({ run: () => throwValue(internal) })
    expectPublicFailure(error)
    expect(error).not.toBe(internal)
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error']],
      leaks: []
    })
  })

  it('catches rejections and preserves asynchronous success', async () => {
    const error = Object.assign(new Error('PRIVATE'), {
      internalContext: 'PRIVATE_CONTEXT'
    })
    await expect(
      protectServerOperation({ run: () => Promise.reject(error) })
    ).rejects.toThrow(PUBLIC_MESSAGE)
    await expect(
      protectServerOperation({ run: () => Promise.resolve({ ok: true }) })
    ).resolves.toStrictEqual({ ok: true })
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error']],
      leaks: []
    })
  })

  it('rejects errors, classes, cycles and deferred sources inside results', async () => {
    const cyclic: CyclicData = {}
    cyclic.self = cyclic
    for (const value of [
      new Error('PRIVATE'),
      { error: new Error('PRIVATE') },
      { deferred: Promise.resolve('PRIVATE') },
      new Date(),
      cyclic
    ]) {
      expectPublicFailure(thrownValue({ run: () => value }))
      await expect(
        protectServerOperation({ run: () => Promise.resolve({ value }) })
      ).rejects.toThrow(PUBLIC_MESSAGE)
    }
  })

  it('rejects getters without executing them and accepts resolved public fields', () => {
    const getter = vi.fn<() => string>(() => 'PRIVATE')
    const data = Object.defineProperty({}, 'private', {
      get: getter,
      enumerable: true
    })
    expectPublicFailure(thrownValue({ run: () => data }))
    expect(getter).not.toHaveBeenCalled()
    expect(
      protectServerOperation({
        run: () => [null, undefined, true, 1, 'public', { ok: true }]
      })
    ).toStrictEqual([null, undefined, true, 1, 'public', { ok: true }])
  })

  it('rejects Array subclasses without executing inherited serialization', async () => {
    const serialize = vi.fn<() => string[]>(() => ['PRIVATE_SERIALIZER'])
    class Rows extends Array<string> {
      public toJSON(): string[] {
        return serialize()
      }
    }
    const rows = new Rows('public')
    // A bodyless status avoids serializing the fixture before the wrapper.
    const envelope = respond(rows, { status: 204 })
    for (const value of [rows, { rows }, envelope]) {
      expectPublicFailure(thrownValue({ run: () => value, allowControl: true }))
      await expect(
        protectServerOperation({
          run: () => Promise.resolve(value),
          allowControl: true
        })
      ).rejects.toThrow(PUBLIC_MESSAGE)
    }
    expect(serialize).not.toHaveBeenCalled()
    const plain = ['public']
    expect(protectServerOperation({ run: () => plain })).toBe(plain)
  })

  it('always creates a new public error even if the previous one was tampered with', () => {
    const original = createPublicError()
    const first = thrownValue({ run: () => throwValue(original) })
    expectPublicFailure(first)
    expect(first).not.toBe(original)
    original.message = 'PRIVATE'
    Object.assign(original, {
      cause: 'PRIVATE_CAUSE',
      internalContext: 'PRIVATE_CONTEXT'
    })
    expectPublicFailure(thrownValue({ run: () => throwValue(original) }))
    expect(console.error).not.toHaveBeenCalled()
  })

  it('preserves Solid signals only when the invocation allows controls', async () => {
    const pending = new NotReadyError(Promise.resolve('ready'))
    for (const control of [redirect('/'), reload(), pending]) {
      const run = () => throwValue(control)
      const logged = vi.mocked(console.error).mock.calls.length
      expect(thrownValue({ run, allowControl: true })).toBe(control)
      await expect(
        protectServerOperation({
          run: async () => throwValue(await Promise.resolve(control)),
          allowControl: true
        })
      ).rejects.toBe(control)
      expect(console.error).toHaveBeenCalledTimes(logged)
      expectPublicFailure(thrownValue({ run }))
    }
    const response = redirect('/')
    expect(
      protectServerOperation({ run: () => response, allowControl: true })
    ).toBe(response)
    expectPublicFailure(thrownValue({ run: () => response }))
  })

  it('rejects thrown and returned Response.error() as controls', () => {
    const failure = Response.error()

    expectPublicFailure(
      thrownValue({ run: () => throwValue(failure), allowControl: true })
    )
    expectPublicFailure(thrownValue({ run: () => failure, allowControl: true }))
    // A thrown Response is not an Error; a returned one fails the structural
    // check with an Error created by the wrapper.
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE], [LOG_MESSAGE, 'Error']],
      leaks: []
    })
  })

  it('checks envelope values and rejects upstream bodies', () => {
    const response = respond(
      { ok: true },
      {
        status: HTTP_CREATED,
        headers: { 'x-public': 'yes' },
        revalidate: 'users'
      }
    )
    const rebuilt: unknown = protectServerOperation({
      run: () => response,
      allowControl: true
    })
    if (!isResponseEnvelope(rebuilt)) throw new TypeError('Expected envelope')
    expect(rebuilt.value).toStrictEqual({ ok: true })
    expect(rebuilt.response?.status).toBe(HTTP_CREATED)
    expect(rebuilt.response?.headers.get('x-public')).toBe('yes')
    expect(rebuilt.response?.headers.get('x-revalidate')).toBe('users')
    const control = thrownValue({
      run: () => throwValue(response),
      allowControl: true
    })
    expect(control).toMatchObject({ value: { ok: true } })
    const invalid = respond({ error: new Error('PRIVATE') })
    expectPublicFailure(
      thrownValue({ run: () => throwValue(invalid), allowControl: true })
    )
    const upstream = new Response('PRIVATE')
    expectPublicFailure(
      thrownValue({ run: () => upstream, allowControl: true })
    )
    expectPublicFailure(
      thrownValue({ run: () => throwValue(upstream), allowControl: true })
    )
  })

  it('keeps concurrent operation results separate', async () => {
    const results = await Promise.allSettled([
      protectServerOperation({
        run: () => Promise.reject(new Error('PRIVATE_A'))
      }),
      protectServerOperation({
        run: () => Promise.resolve({ message: 'public B' })
      }),
      protectServerOperation({
        run: () => Promise.reject(new Error('PRIVATE_C'))
      })
    ])
    expect(results[1]).toStrictEqual({
      status: 'fulfilled',
      value: { message: 'public B' }
    })
    for (const result of results) {
      if (result.status === 'rejected') expectPublicFailure(result.reason)
    }
  })
})

describe('envelope reconstruction', () => {
  // respond() serializes its initial data. Replacing value afterwards must
  // not forward the original body.
  it('rebuilds the envelope and body from checked data', async () => {
    const envelope = respond(
      { secret: 'PRIVATE_BODY' },
      { status: HTTP_CREATED, headers: { 'x-public': 'yes' } }
    )
    Object.assign(envelope, { value: { ok: true } })

    const rebuilt: unknown = protectServerOperation({
      run: () => envelope,
      allowControl: true
    })

    if (!isResponseEnvelope(rebuilt)) throw new TypeError('Expected envelope')
    expect(rebuilt).not.toBe(envelope)
    expect(rebuilt.value).toStrictEqual({ ok: true })
    expect(rebuilt.status).toBe(HTTP_CREATED)
    expect(rebuilt.headers.get('x-public')).toBe('yes')
    await expect(rebuilt.text()).resolves.toBe('{"ok":true}')
  })
})

describe('bodyless envelopes', () => {
  beforeEach(mockProductionLog)

  it.each([HTTP_NO_CONTENT, HTTP_RESET_CONTENT, HTTP_NOT_MODIFIED])(
    'checks private data in an envelope with status %s',
    status => {
      const envelope = respond({ error: new Error('PRIVATE') }, { status })
      expect(envelope).toBeInstanceOf(Response)
      expectPublicFailure(
        thrownValue({ run: () => envelope, allowControl: true })
      )
      expectPublicFailure(
        thrownValue({
          run: () => throwValue(envelope),
          allowControl: true
        })
      )
    }
  )
})

describe('operation protection logs', () => {
  beforeEach(mockProductionLog)

  it('throws a public error even when logging fails', async () => {
    // Both synchronous and asynchronous paths lose the log destination.
    // The spy then returns to normal for Vitest itself.
    vi.mocked(console.error)
      .mockImplementationOnce(logUnavailable)
      .mockImplementationOnce(logUnavailable)
      .mockImplementationOnce(logUnavailable)
      .mockImplementationOnce(logUnavailable)

    expectPublicFailure(
      thrownValue({ run: () => throwValue(new Error('PRIVATE_SYNC')) })
    )
    await expect(
      protectServerOperation({
        run: () => Promise.reject(new Error('PRIVATE_ASYNC'))
      })
    ).rejects.toThrow(PUBLIC_MESSAGE)
    expect(readLog(console.error)).toStrictEqual({
      heads: [
        [LOG_MESSAGE, 'Error'],
        [LOG_MESSAGE],
        [LOG_MESSAGE, 'Error'],
        [LOG_MESSAGE]
      ],
      leaks: []
    })
  })

  it('prints the original after the filtered line in development', () => {
    vi.stubEnv('DEV', true)
    const failure = new Error('PRIVATE')

    expectPublicFailure(thrownValue({ run: () => throwValue(failure) }))
    expect(readLog(console.error).heads[0]).toStrictEqual([
      LOG_MESSAGE,
      'Error'
    ])
    expect(vi.mocked(console.error).mock.calls.slice(1)).toStrictEqual([
      [failure]
    ])
  })
})

describe('public data structure', () => {
  beforeEach(mockProductionLog)

  it('inspects setters, Symbol keys and non-enumerable properties', () => {
    const secret = Symbol('secret')
    const setter = vi.fn<(value: string) => void>()
    for (const value of [
      // oxlint-disable-next-line eslint/accessor-pairs -- A standalone setter is precisely what this guard must reject.
      Object.defineProperty({}, 'private', { set: setter, enumerable: true }),
      { [secret]: new Error('PRIVATE') },
      { [secret]: Object.defineProperty({}, 'private', { get: () => 'X' }) },
      Object.defineProperty({}, 'private', {
        value: new Error('PRIVATE'),
        enumerable: false
      })
    ]) {
      expectPublicFailure(thrownValue({ run: () => value }))
    }
    expect(setter).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledTimes(REJECTED_SHAPES)
  })

  it('accepts shared references visiting each node once and rejects deep cycles', () => {
    const shared = { id: 1 }
    const dag = { a: shared, b: [shared, { c: shared }] }
    expect(protectServerOperation({ run: () => dag })).toBe(dag)
    // A diamond doubles paths at every level: without memoization, 16 levels
    // would take 2^17 - 1 visits instead of 17, independently of machine speed.
    const count: VisitCount = { visits: 0 }
    let diamond = countedNode({ node: { leaf: true }, count })
    for (let depth = 0; depth < DIAMOND_DEPTH; depth += 1) {
      diamond = countedNode({
        node: { left: diamond, right: diamond },
        count
      })
    }
    expect(protectServerOperation({ run: () => diamond })).toBe(diamond)
    expect(count.visits).toBe(DIAMOND_DEPTH + 1)
    const nested: CyclicData = {}
    nested.self = nested
    expectPublicFailure(
      thrownValue({ run: () => ({ level: { nested }, shared }) })
    )
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error']],
      leaks: []
    })
  })
})
