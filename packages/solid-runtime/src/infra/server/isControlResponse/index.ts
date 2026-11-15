import 'server-only'

// Bodyless responses preserve framework redirects and reloads. Bodies may
// carry upstream data; Response.error() has no body but its status 0 cannot
// be sent over HTTP. Middleware, the hook and operation protection agree.
export function isControlResponse(value: unknown): value is Response {
  try {
    return (
      value instanceof Response && value.body === null && value.status !== 0
    )
  } catch {
    // Inspecting a thrown object can also fail through a getter or Proxy.
    return false
  }
}
