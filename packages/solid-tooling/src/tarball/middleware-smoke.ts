import assert from 'node:assert/strict'

type MiddlewareSmoke = { origin: string; scenario: string }
const REQUEST_TIMEOUT = 1000
const HTTP_TEMPORARY_REDIRECT = 307
const HTTP_INTERNAL_SERVER_ERROR = 500

export async function smokeMiddleware({
  origin,
  scenario
}: MiddlewareSmoke): Promise<void> {
  const prefix = scenario === 'ssr-i18n' ? '/de' : ''
  const publicMessage =
    scenario === 'ssr-i18n'
      ? 'Die Anfrage konnte nicht abgeschlossen werden.'
      : 'The request could not be completed.'
  for (const phase of ['before', 'after', 'control']) {
    const route = phase === 'after' ? prefix || '/' : '/_server/scenario'
    const response = await fetch(
      `${origin}${route}?middleware-error=${phase}`,
      {
        redirect: 'manual',
        headers: { referer: `${origin}${prefix}/`, accept: 'text/html' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT)
      }
    )
    const body = await response.text()
    assert.doesNotMatch(
      body,
      /PRIVATE_SCENARIO/u,
      'Middleware body contains a private marker'
    )
    assert.equal(
      response.status,
      phase === 'control'
        ? HTTP_TEMPORARY_REDIRECT
        : HTTP_INTERNAL_SERVER_ERROR,
      phase
    )
    assert.equal(
      response.headers.get('x-content-type-options'),
      'nosniff',
      'Middleware failure security headers'
    )
    assert.equal(response.headers.get('x-frame-options'), 'DENY')
    assert.match(
      response.headers.get('content-security-policy') ?? '',
      /script-src 'none'/u
    )
    if (phase === 'control') {
      assert.equal(response.headers.get('location'), `${origin}/destination`)
      assert.equal(body, '')
    } else {
      assert.equal(body, publicMessage)
    }
    if (scenario === 'ssr-i18n') {
      assert.equal(response.headers.get('content-language'), 'de')
    } else {
      assert.equal(response.headers.get('content-language'), null)
      assert.equal(response.headers.get('set-cookie'), null)
    }
  }
}
