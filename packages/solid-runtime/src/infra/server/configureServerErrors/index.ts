import 'server-only'
import {
  configureServerErrors as configureSolidServerErrors,
  isResponseEnvelope,
  type ServerErrorContext
} from '@solidjs/web'
import { configureServerFunctionsServer } from '@solidjs/web/server-functions/server'
import { NotReadyError } from 'solid-js'

import { isControlResponse } from '../isControlResponse/index.ts'
import { logServerFailure } from '../logServerFailure/index.ts'
import { protectInvocation } from '../protectServerOperation/registration/index.ts'
import { createPublicError, isPublicError } from '../publicErrors/index.ts'
import {
  configurePublicMessage,
  type PublicMessage
} from '../publicMessage/index.ts'
import {
  markRenderFailure,
  observeRenderFailures
} from '../renderIntegrity/index.ts'

type ServerErrorsOptions = { publicMessage?: PublicMessage }

const isDevelopment = import.meta.env.DEV

function isControlSignal(value: unknown): boolean {
  try {
    return (
      isControlResponse(value) ||
      value instanceof NotReadyError ||
      isResponseEnvelope(value)
    )
  } catch {
    // Inspecting a thrown object can also fail through a getter or Proxy.
    return false
  }
}

// Solid already replaces thrown errors in production. This synchronous
// hook supplies the public message and filtered log for every error channel.
// Its result reaches the client without further sanitization; throwing here
// would make Solid log the hook failure.
function mapServerError(error: unknown): Error | undefined {
  if (isControlSignal(error)) return undefined
  if (!isPublicError(error)) {
    // Installing the hook suppresses the runtime log, so development explicitly
    // requests the original diagnostic.
    logServerFailure({
      source: 'server-error',
      error,
      shouldPrintOriginal: isDevelopment
    })
  }
  // Keep the original diagnostic in development.
  if (isDevelopment) return undefined
  // Also drop properties added to an error after it was marked public.
  return createPublicError()
}

// Markdown requires an error-free render. The global hook supplies that
// signal in development too (solidjs/solid#4130).
function handleServerError(
  error: unknown,
  context: ServerErrorContext
): Error | undefined {
  // A control caught by a nested Errored boundary produces fallback HTML
  // with status 200, so it must mark the render too.
  if (context.kind === 'render') markRenderFailure(context.event)
  return mapServerError(error)
}

export function configureServerErrors(options: ServerErrorsOptions = {}): void {
  configurePublicMessage(options.publicMessage)
  configureServerFunctionsServer({
    wrapInvocation: run => protectInvocation({ run, allowControl: true })
  })
  configureSolidServerErrors({ onError: handleServerError })
  observeRenderFailures()
}
