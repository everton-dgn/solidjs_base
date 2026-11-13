// Only the text/html media type counts: text/html-sandboxed, or a parameter
// that mentions text/html, gets no nonce and no Markdown conversion.
export function isHtmlResponse(response: Response): boolean {
  return /^\s*text\/html\s*(?:;|$)/iu.test(
    response.headers.get('content-type') ?? ''
  )
}
