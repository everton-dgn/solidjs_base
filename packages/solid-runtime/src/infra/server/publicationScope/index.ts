import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'

import { createPublicError } from '../publicErrors/index.ts'

type PublicationScope = {
  signal: AbortSignal
  isActive: () => boolean
  observe: (operation: Promise<unknown>) => void
}
type ScopeOptions<T> = PublicationScope & { run: () => T }

const storage = new AsyncLocalStorage<PublicationScope>()

export function withPublicationScope<T>({ run, ...scope }: ScopeOptions<T>): T {
  return storage.run(scope, run)
}

export function assertPublicationActive(): void {
  const scope = storage.getStore()
  if (!scope) return
  if (scope.signal.aborted) throw createPublicError()
  if (!scope.isActive()) throw new Error('Publication already completed')
}

// Only the publication signal reason counts as cancellation. A different
// error remains a failure even after that signal aborts.
export function isPublicationCancellation(error: unknown): boolean {
  const signal = storage.getStore()?.signal
  return signal?.aborted === true && Object.is(error, signal.reason)
}

export function observePublicationOperation(operation: Promise<unknown>): void {
  storage.getStore()?.observe(operation)
}
