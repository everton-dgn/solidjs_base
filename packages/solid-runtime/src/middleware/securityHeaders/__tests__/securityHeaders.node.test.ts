import { createRequire } from 'node:module'

import { createRequestEvent, type RequestEvent } from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'

import { CSP_DIRECTIVES, SECURITY_HEADERS } from '../constants.js'
import { createSecurityHeaders } from '../index.ts'

const TEST_ORIGIN = 'http://localhost'
const HTTP_FOUND = 302
const NONCE = 'bm9uY2UtZGUtdGVzdGU='
const HTML_HEADERS = { 'content-type': 'text/html; charset=utf-8' }

const EXPECTED_HEADERS = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
  'cross-origin-resource-policy': 'same-origin'
}

const IMAGE_DIRECTIVE = "img-src 'self' https://images.example"

type ApplyOptions = {
  apply: (response: Response) => Response
  response: Response
}

const { applySecurityHeaders, securityHeaders } = createSecurityHeaders()

// applySecurityHeaders reads the nonce from the request event.
function applyWithNonce({ apply, response }: ApplyOptions): Response {
  const event: RequestEvent = createRequestEvent(new Request(TEST_ORIGIN))
  event.nonce = NONCE
  return provideRequestEvent(event, () => apply(response))
}

function applyInRequest(response: Response): Response {
  return applyWithNonce({ apply: applySecurityHeaders, response })
}

function htmlResponse(): Response {
  return new Response('<main>content</main>', { headers: HTML_HEADERS })
}

function renderPage(): Promise<Response> {
  return Promise.resolve(htmlResponse())
}

// CSP directives by name, regardless of their order.
function directives(response: Response): Record<string, string> {
  const policy = response.headers.get('content-security-policy') ?? ''
  return Object.fromEntries(
    policy.split('; ').map(directive => {
      const [name = '', ...values] = directive.split(' ')
      return [name, values.join(' ')]
    })
  )
}

describe('security headers of the response', () => {
  beforeEach(() => {
    // The CSP is only sent in production builds; Vitest runs with DEV.
    vi.stubEnv('DEV', false)
  })

  it('sets the security headers', () => {
    const response = applyInRequest(new Response('content'))

    expect(Object.fromEntries(response.headers)).toMatchObject(EXPECTED_HEADERS)
  })

  it('builds the CSP with the nonce and strict-dynamic, without unsafe-inline in scripts and styles', () => {
    const response = applyInRequest(
      new Response('<main>content</main>', { headers: HTML_HEADERS })
    )

    expect(directives(response)).toStrictEqual({
      'default-src': "'self'",
      'script-src': `'nonce-${NONCE}' 'strict-dynamic'`,
      'style-src': "'self'",
      'object-src': "'none'",
      'base-uri': "'self'",
      'form-action': "'self'",
      'frame-ancestors': "'none'"
    })
  })

  it('blocks every script when the script nonce is disabled', () => {
    const event: RequestEvent = createRequestEvent(new Request(TEST_ORIGIN))
    event.nonce = { script: false, style: false }

    const response = provideRequestEvent(event, () =>
      applySecurityHeaders(
        new Response('<main>content</main>', { headers: HTML_HEADERS })
      )
    )

    expect(directives(response)['script-src']).toBe("'none'")
  })

  // sitemap.xml, robots.txt and llms.txt have s-maxage: a nonce in the CSP
  // would be stored in the shared cache.
  it.each([
    'text/plain; charset=utf-8',
    'application/xml; charset=utf-8',
    'text/markdown; charset=utf-8',
    'application/json',
    'text/html-sandboxed',
    'application/json; profile=text/html'
  ])('blocks scripts in a %s response even with a nonce', contentType => {
    const response = applyInRequest(
      new Response('content', { headers: { 'content-type': contentType } })
    )

    expect(directives(response)['script-src']).toBe("'none'")
    expect(response.headers.get('content-security-policy')).not.toContain(NONCE)
  })

  it('recognizes the HTML content-type regardless of case', () => {
    const response = applyInRequest(
      new Response('<main>content</main>', {
        headers: { 'content-type': 'Text/HTML; charset=UTF-8' }
      })
    )

    expect(directives(response)['script-src']).toBe(
      `'nonce-${NONCE}' 'strict-dynamic'`
    )
  })

  it('omits the CSP in development and keeps the other headers', () => {
    vi.stubEnv('DEV', true)

    const response = applyInRequest(new Response('content'))

    expect(response.headers.has('content-security-policy')).toBe(false)
    expect(Object.fromEntries(response.headers)).toMatchObject(EXPECTED_HEADERS)
  })

  // Response.redirect() comes with immutable headers and no body. Without a
  // document, the redirect runs no scripts.
  it('sets the headers and the CSP on a copy of a redirect', () => {
    const response = applyInRequest(
      Response.redirect(new URL('/destination', TEST_ORIGIN), HTTP_FOUND)
    )

    expect({
      status: response.status,
      location: response.headers.get('location'),
      ...Object.fromEntries(response.headers)
    }).toMatchObject({
      status: HTTP_FOUND,
      location: `${TEST_ORIGIN}/destination`,
      ...EXPECTED_HEADERS
    })
    expect(directives(response)['script-src']).toBe("'none'")
  })

  it('keeps the redirect status when the Node adapter materializes the body', async () => {
    const require = createRequire(import.meta.url)
    const adapterPath = require.resolve('srvx/node', {
      paths: [require.resolve('nitro')]
    })
    const adapter: unknown = await import(adapterPath)
    assert(typeof adapter === 'object' && adapter !== null)
    assert(
      'NodeResponse' in adapter && typeof adapter.NodeResponse === 'function'
    )
    const redirect = Response.redirect(
      new URL('/destination', TEST_ORIGIN),
      HTTP_FOUND
    )

    vi.stubGlobal('Response', adapter.NodeResponse)
    try {
      const response = applyInRequest(redirect)

      expect(response.body).toBeNull()
      expect(response.status).toBe(HTTP_FOUND)
      expect(response.headers.get('location')).toBe(
        `${TEST_ORIGIN}/destination`
      )
      expect(Object.fromEntries(response.headers)).toMatchObject(
        EXPECTED_HEADERS
      )
      expect(directives(response)['script-src']).toBe("'none'")
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('security headers', () => {
  beforeEach(() => {
    // The CSP is only sent in production builds; Vitest runs with DEV.
    vi.stubEnv('DEV', false)
  })

  it('adds the security headers to the response', async () => {
    const response = new Response('content')
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(response)

    await expect(securityHeaders(new Request(TEST_ORIGIN), next)).resolves.toBe(
      response
    )
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe(
      'strict-origin-when-cross-origin'
    )
    expect(next).toHaveBeenCalledExactlyOnceWith()
  })

  // The render reads the nonce from the event; it must exist when next() runs.
  it('creates the nonce before the render and uses it in the CSP', async () => {
    const event: RequestEvent = createRequestEvent(new Request(TEST_ORIGIN))
    let seen: unknown
    const next = vi.fn<() => Promise<Response>>().mockImplementation(() => {
      seen = event.nonce
      return Promise.resolve(
        new Response('<main>page</main>', {
          headers: { 'content-type': 'text/html; charset=utf-8' }
        })
      )
    })

    const response = await provideRequestEvent(event, () =>
      securityHeaders(event.request, next)
    )

    assert(typeof seen === 'string')
    expect(response.headers.get('content-security-policy')).toContain(
      `script-src 'nonce-${seen}' 'strict-dynamic'`
    )
  })
})

describe('options of the security headers', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false)
  })

  it('sends a changed header value and keeps the other headers', () => {
    const { applySecurityHeaders: apply } = createSecurityHeaders({
      headers: { ...SECURITY_HEADERS, 'x-frame-options': 'SAMEORIGIN' }
    })

    const response = applyWithNonce({
      apply,
      response: new Response('content')
    })

    expect(Object.fromEntries(response.headers)).toMatchObject({
      ...EXPECTED_HEADERS,
      'x-frame-options': 'SAMEORIGIN'
    })
  })

  it('sends an added directive once, before the script-src of the package', () => {
    const { applySecurityHeaders: apply } = createSecurityHeaders({
      cspDirectives: [...CSP_DIRECTIVES, IMAGE_DIRECTIVE]
    })

    const response = applyWithNonce({ apply, response: htmlResponse() })

    expect(response.headers.get('content-security-policy')).toBe(
      [
        ...CSP_DIRECTIVES,
        IMAGE_DIRECTIVE,
        `script-src 'nonce-${NONCE}' 'strict-dynamic'`
      ].join('; ')
    )
  })

  // Each option replaces the default set instead of merging with it.
  it('sends only the headers and directives it receives', () => {
    const { applySecurityHeaders: apply } = createSecurityHeaders({
      headers: { 'x-content-type-options': 'nosniff' },
      cspDirectives: ["default-src 'self'"]
    })

    const response = applyWithNonce({ apply, response: htmlResponse() })

    expect(Object.fromEntries(response.headers)).toStrictEqual({
      'content-type': HTML_HEADERS['content-type'],
      'x-content-type-options': 'nosniff',
      'content-security-policy': `default-src 'self'; script-src 'nonce-${NONCE}' 'strict-dynamic'`
    })
  })

  it('keeps the values it received when the application changes them later', () => {
    const headers: Record<string, string> = { ...SECURITY_HEADERS }
    const cspDirectives: string[] = [...CSP_DIRECTIVES]
    const { applySecurityHeaders: apply } = createSecurityHeaders({
      headers,
      cspDirectives
    })
    headers['x-frame-options'] = 'SAMEORIGIN'
    cspDirectives.push('script-src *')

    const response = applyWithNonce({ apply, response: htmlResponse() })

    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(directives(response)['script-src']).toBe(
      `'nonce-${NONCE}' 'strict-dynamic'`
    )
  })
})

describe('creation of the security headers', () => {
  it.each([
    ["script-src 'self'", 'script-src'],
    ["script-src-elem 'self'", 'script-src-elem'],
    ["script-src-attr 'none'", 'script-src-attr'],
    ["Script-Src 'unsafe-inline'", 'script-src']
  ])(
    'refuses the directive %s, which the package builds',
    (directive, name) => {
      expect(() =>
        createSecurityHeaders({ cspDirectives: [...CSP_DIRECTIVES, directive] })
      ).toThrow(
        `createSecurityHeaders: cspDirectives cannot set ${name}, because the package builds script-src from the request nonce.`
      )
    }
  )

  it('refuses two directives with the same name, regardless of case', () => {
    expect(() =>
      createSecurityHeaders({
        cspDirectives: [...CSP_DIRECTIVES, IMAGE_DIRECTIVE, "IMG-SRC 'none'"]
      })
    ).toThrow(
      'createSecurityHeaders: cspDirectives sets img-src twice, and a policy uses only the first one.'
    )
  })

  // A second directive inside an item would come before the script-src of the
  // package, and the policy would use it.
  it.each([
    "img-src 'self'; script-src *",
    "img-src 'self', script-src *",
    '',
    '   '
  ])(
    'refuses the item %j, which does not hold exactly one directive',
    directive => {
      expect(() =>
        createSecurityHeaders({ cspDirectives: [...CSP_DIRECTIVES, directive] })
      ).toThrow(
        `createSecurityHeaders: each item of cspDirectives must hold exactly one directive, and "${directive}" does not.`
      )
    }
  )

  it.each(['content-security-policy', 'Content-Security-Policy'])(
    'refuses the %s header, which the package builds',
    name => {
      expect(() =>
        createSecurityHeaders({
          headers: { ...SECURITY_HEADERS, [name]: "default-src 'self'" }
        })
      ).toThrow(
        `createSecurityHeaders: headers cannot set ${name}, because the package builds the CSP from cspDirectives and the request nonce.`
      )
    }
  )
})

describe('instances of the security headers', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false)
  })

  it('keeps the values of each instance apart', async () => {
    const changed = createSecurityHeaders({
      headers: { ...SECURITY_HEADERS, 'x-frame-options': 'SAMEORIGIN' },
      cspDirectives: [...CSP_DIRECTIVES, IMAGE_DIRECTIVE]
    })

    const fromChanged = await changed.securityHeaders(
      new Request(TEST_ORIGIN),
      renderPage
    )
    const fromDefault = await securityHeaders(
      new Request(TEST_ORIGIN),
      renderPage
    )

    expect(fromChanged.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    expect(directives(fromChanged)['img-src']).toBe(
      "'self' https://images.example"
    )
    expect(fromDefault.headers.get('x-frame-options')).toBe('DENY')
    expect(directives(fromDefault)).not.toHaveProperty('img-src')
  })

  // A default instance next to the configured one would let two call sites
  // send different headers.
  it('exports the factory and the nonce, without a default instance', async () => {
    const entry = await import('../index.ts')

    expect(Object.keys(entry).toSorted()).toStrictEqual([
      'createSecurityHeaders',
      'requestNonce'
    ])
  })
})
