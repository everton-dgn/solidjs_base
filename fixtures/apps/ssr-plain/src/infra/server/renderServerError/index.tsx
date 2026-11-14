import { getLocale } from '@evertondgn/solid-runtime/i18n/locale'
import { protectServerOperation } from '@evertondgn/solid-runtime/server/protect-server-operation'
import {
  createPublicError,
  isPublicError
} from '@evertondgn/solid-runtime/server/public-errors'
import { createRenderIntegrity } from '@evertondgn/solid-runtime/server/render-integrity'
import type { RequestEvent } from '@solidjs/web'
import { Errored, untrack } from 'solid-js'

export function renderServerError(event: RequestEvent) {
  const kind = new URL(event.request.url).searchParams.get('kind')
  const integrity = createRenderIntegrity()
  event.locals.ssrRenderState = integrity.state
  if (kind === 'identity') {
    const original = createPublicError()
    let replacement: unknown
    try {
      protectServerOperation({
        run: () => {
          throw original
        }
      })
    } catch (error) {
      replacement = error
    }
    return (
      <main>
        {`identity=${isPublicError(replacement) && replacement !== original};observed=${integrity.state.hasErrors === false}`}
      </main>
    )
  }
  const failure =
    kind === 'public'
      ? createPublicError()
      : new Error('MESSAGE_PRIVATE_SCENARIO', {
          cause: new Error('CAUSE_PRIVATE_SCENARIO')
        })
  Object.assign(failure, { privateContext: 'PROPERTY_PRIVATE_SCENARIO' })
  function Fail(): never {
    throw failure
  }
  return (
    <html lang={getLocale()}>
      <body>
        <Errored
          fallback={error => {
            const publicError = untrack(error)
            return (
              <main>
                {publicError instanceof Error ? publicError.message : 'unknown'}
              </main>
            )
          }}
        >
          <Fail />
        </Errored>
      </body>
    </html>
  )
}
