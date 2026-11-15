import 'server-only'
import type { RequestEvent } from '@solidjs/web'

import type { SsrRenderState } from '../../../@types/solid.d.ts'

type RenderIntegrity = {
  state: SsrRenderState
  complete: () => void
}

// Only the factory can mark the exposed read-only state.
const markers = new WeakMap<SsrRenderState, () => void>()
let isObserved = false

// Without the hook, failures cannot mark the state. Undefined hasErrors
// keeps Markdown publication closed until registration.
export function observeRenderFailures(): void {
  isObserved = true
}

export function createRenderIntegrity(): RenderIntegrity {
  let hasErrors = isObserved ? false : undefined
  let hasCompleted = false
  const state: SsrRenderState = {
    get hasErrors() {
      return hasErrors
    },
    get hasCompleted() {
      return hasCompleted
    }
  }
  markers.set(state, () => {
    hasErrors = true
  })
  return {
    state,
    complete: () => {
      hasCompleted = true
    }
  }
}

export function markRenderFailure(event: RequestEvent | undefined): void {
  const state = event?.locals.ssrRenderState
  if (state) markers.get(state)?.()
}
