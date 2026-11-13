import { applySecurityHeaders } from '@evertondgn/solid-runtime/middleware/security-headers'

export function uncachedResponse(response: Response): Response {
  response.headers.set('cache-control', 'private, no-store')
  return applySecurityHeaders(response)
}
