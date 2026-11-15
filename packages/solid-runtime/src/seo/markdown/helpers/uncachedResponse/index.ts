export function createUncachedResponse(
  applySecurityHeaders: (response: Response) => Response
): (response: Response) => Response {
  return response => {
    response.headers.set('cache-control', 'private, no-store')
    return applySecurityHeaders(response)
  }
}
