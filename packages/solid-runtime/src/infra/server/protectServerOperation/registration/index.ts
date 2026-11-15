import 'server-only'
import { isResponseEnvelope, respond } from '@solidjs/web'
import { NotReadyError } from 'solid-js'

import { isControlResponse } from '../../isControlResponse/index.ts'
import { logServerFailure } from '../../logServerFailure/index.ts'
import {
  assertPublicationActive,
  isPublicationCancellation,
  observePublicationOperation
} from '../../publicationScope/index.ts'
import { createPublicError, isPublicError } from '../../publicErrors/index.ts'

type Operation<T> = { run: () => T; allowControl?: boolean }
type DataCheck = { value: unknown; path?: Set<object>; done?: WeakSet<object> }

const PUBLIC_PRIMITIVE_TYPES = new Set([
  'undefined',
  'string',
  'number',
  'boolean'
])

// Nested errors, promises and streams could fail or expose diagnostics
// after this boundary. Only resolved data may cross it.
function assertPublicData({
  value,
  path = new Set<object>(),
  done = new WeakSet<object>()
}: DataCheck): void {
  if (value === null || PUBLIC_PRIMITIVE_TYPES.has(typeof value)) return
  if (typeof value !== 'object' || value instanceof Error) {
    throw new TypeError('Server operations must return plain public data')
  }
  const prototype: unknown = Object.getPrototypeOf(value)
  if (
    Array.isArray(value)
      ? prototype !== Array.prototype
      : prototype !== Object.prototype && prototype !== null
  ) {
    throw new Error('Server operations must return plain public data')
  }
  if (path.has(value)) {
    throw new Error('Server operations must return acyclic data')
  }
  // Memoize checked shared references to avoid exponential traversal of a DAG.
  if (done.has(value)) return
  path.add(value)
  // Reflect.ownKeys also checks symbols and non-enumerable properties.
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor?.get || descriptor?.set) {
      throw new Error('Server operations must return resolved data')
    }
    const field: unknown = descriptor?.value
    assertPublicData({ value: field, path, done })
  }
  path.delete(value)
  done.add(value)
}

function controlResponse(value: unknown): Response | undefined {
  // Only deliberate application controls preserve redirects/reloads.
  // Envelopes are Responses too, including those without a body.
  if (isResponseEnvelope(value)) {
    assertPublicData({ value: value.value })
    // Rebuild the body from checked data instead of forwarding an attached body.
    const rebuilt: unknown = respond(value.value, {
      status: value.response?.status,
      headers: value.response?.headers
    })
    if (isResponseEnvelope(rebuilt)) return rebuilt
    throw new TypeError('Expected a response envelope')
  }
  if (isControlResponse(value)) return value
  return undefined
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    'then' in value &&
    typeof value.then === 'function'
  )
}

export function protectInvocation<T>(operation: Operation<T>): T

export function protectInvocation({
  run,
  allowControl = false
}: Operation<unknown>): unknown {
  function publicFailure(error: unknown): never {
    let control: Response | NotReadyError | undefined
    if (allowControl) {
      try {
        control =
          error instanceof NotReadyError ? error : controlResponse(error)
      } catch {
        // Inspecting the exception can itself fail.
      }
    }
    // oxlint-disable-next-line typescript/only-throw-error -- Solid uses Response/ResponseEnvelope as control signals.
    if (control) throw control
    if (!isPublicError(error) && !isPublicationCancellation(error)) {
      // Only the new public error reaches the hook; development explicitly
      // requests the original diagnostic here.
      logServerFailure({
        source: 'server-operation',
        error,
        shouldPrintOriginal: import.meta.env.DEV
      })
    }
    throw createPublicError()
  }

  function publicResult(value: unknown): unknown {
    if (allowControl) {
      const control = controlResponse(value)
      if (control) return control
    }
    assertPublicData({ value })
    return value
  }

  async function settle(result: PromiseLike<unknown>): Promise<unknown> {
    try {
      return publicResult(await result)
    } catch (error) {
      return publicFailure(error)
    }
  }

  try {
    assertPublicationActive()
    const result = run()
    if (isPromiseLike(result)) {
      const operation = settle(result)
      observePublicationOperation(operation)
      return operation
    }
    return publicResult(result)
  } catch (error) {
    return publicFailure(error)
  }
}
