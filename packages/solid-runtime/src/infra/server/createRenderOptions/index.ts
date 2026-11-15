import 'server-only'
import { getRequestEvent, type renderToStream } from '@solidjs/web'

import { createRenderIntegrity } from '../renderIntegrity/index.ts'

type RenderOptions = Pick<
  NonNullable<Parameters<typeof renderToStream>[1]>,
  'nonce' | 'signal' | 'onCompleteAll'
>

export function createRenderOptions(): RenderOptions {
  const event = getRequestEvent()
  // The global error hook must see the state before the first render pass.
  const integrity = createRenderIntegrity()
  if (event) event.locals.ssrRenderState = integrity.state
  return {
    nonce: event?.nonce ?? undefined,
    signal: event?.request.signal,
    onCompleteAll: integrity.complete
  }
}
