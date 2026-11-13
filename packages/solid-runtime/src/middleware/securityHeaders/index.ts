import { getRequestEvent } from '@solidjs/web'

import { isHtmlResponse } from '../helpers/isHtmlResponse/index.ts'
import type { Middleware, Next } from '../types.ts'
import { CSP_DIRECTIVES, SECURITY_HEADERS } from './constants.js'

type HeaderValues = Readonly<Record<string, string>>

type HeaderUpdate = { response: Response; headers: HeaderValues }

type HeaderEntry = { name: string; value: string }

type Policy = { directives: readonly string[]; scriptSrc: string }

type SecurityHeadersOptions = {
  headers?: HeaderValues
  cspDirectives?: readonly string[]
}

type SecurityHeaders = {
  securityHeaders: Middleware
  applySecurityHeaders: (response: Response) => Response
}

const NONCE_BYTES = 16
const NO_SCRIPTS = "script-src 'none'"
const SCRIPT_DIRECTIVES = new Set([
  'script-src',
  'script-src-elem',
  'script-src-attr'
])

function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
  return btoa(String.fromCodePoint(...bytes))
}

function directiveName(directive: string): string {
  return directive.trim().split(/\s+/u)[0]?.toLowerCase() ?? ''
}

function joinPolicy({ directives, scriptSrc }: Policy): string {
  return [...directives, scriptSrc].join('; ')
}

// Headers refuses a name or a value it cannot send. Checking at creation makes
// a bad value fail when the application starts, not on every response.
function isSendable({ name, value }: HeaderEntry): boolean {
  try {
    new Headers().set(name, value)
    return true
  } catch {
    return false
  }
}

// A policy uses the first of two directives with the same name, so an item
// that holds a second directive could replace the script-src of the package.
function checkDirectives(directives: readonly string[]): void {
  const names = new Set<string>()
  for (const directive of directives) {
    const name = directiveName(directive)
    if (name === '' || /[;,]/u.test(directive)) {
      throw new Error(
        `createSecurityHeaders: each item of cspDirectives must hold exactly one directive, and "${directive}" does not.`
      )
    }
    if (SCRIPT_DIRECTIVES.has(name)) {
      throw new Error(
        `createSecurityHeaders: cspDirectives cannot set ${name}, because the package builds script-src from the request nonce.`
      )
    }
    if (names.has(name)) {
      throw new Error(
        `createSecurityHeaders: cspDirectives sets ${name} twice, and a policy uses only the first one.`
      )
    }
    names.add(name)
  }
  // WHY: the probe is the policy as a response sends it, with the script-src
  // at the end. Headers trims the ends of a value, so a line break that closes
  // the last item would pass alone and fail in every response.
  const policy = joinPolicy({ directives, scriptSrc: NO_SCRIPTS })
  if (!isSendable({ name: 'content-security-policy', value: policy })) {
    throw new Error(
      'createSecurityHeaders: cspDirectives has a character that a header value cannot carry.'
    )
  }
}

function checkHeaders(headers: HeaderValues): void {
  const csp = Object.keys(headers).find(
    name => name.toLowerCase() === 'content-security-policy'
  )
  if (csp !== undefined) {
    throw new Error(
      `createSecurityHeaders: headers cannot set ${csp}, because the package builds the CSP from cspDirectives and the request nonce.`
    )
  }
  const invalid = Object.entries(headers).find(
    ([name, value]) => !isSendable({ name, value })
  )
  if (invalid !== undefined) {
    throw new Error(
      `createSecurityHeaders: headers has "${invalid[0]}", whose name or value a header cannot carry.`
    )
  }
}

// A control response, with no body, can be copied to take the headers; an
// upstream body is left to the failure containment.
function withHeaders({ response, headers }: HeaderUpdate): Response {
  try {
    for (const [name, value] of Object.entries(headers)) {
      response.headers.set(name, value)
    }
    return response
  } catch (error) {
    if (response.body !== null) throw error
    const copy = new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    })
    for (const [name, value] of Object.entries(headers)) {
      copy.headers.set(name, value)
    }
    return copy
  }
}

export function requestNonce(): string | undefined {
  const event = getRequestEvent()
  if (!event) return undefined
  event.nonce ??= createNonce()
  const nonce =
    typeof event.nonce === 'string' ? event.nonce : event.nonce.script
  return nonce === false ? undefined : nonce
}

// Each option replaces the whole default set. The values are copied here, so a
// later change to the objects the application passed does not reach responses.
export function createSecurityHeaders({
  headers = SECURITY_HEADERS,
  cspDirectives = CSP_DIRECTIVES
}: SecurityHeadersOptions = {}): SecurityHeaders {
  checkHeaders(headers)
  checkDirectives(cspDirectives)
  const fixedHeaders: HeaderValues = { ...headers }
  const directives = [...cspDirectives]

  // With the nonce, only the scripts that carry it run, and 'strict-dynamic'
  // allows the modules they load. Without a nonce, no script runs.
  function contentSecurityPolicy(nonce: string | undefined): string {
    return joinPolicy({
      directives,
      scriptSrc: nonce
        ? `script-src 'nonce-${nonce}' 'strict-dynamic'`
        : NO_SCRIPTS
    })
  }

  // Development uses the inline styles of HMR; the production policy only
  // allows external style sheets. Only HTML documents run scripts: text, XML,
  // JSON and redirects get script-src 'none', and the request nonce is not
  // stored in the shared cache of the responses with s-maxage.
  function applySecurityHeaders(response: Response): Response {
    return withHeaders({
      response,
      headers: import.meta.env.DEV
        ? fixedHeaders
        : {
            ...fixedHeaders,
            'content-security-policy': contentSecurityPolicy(
              isHtmlResponse(response) ? requestNonce() : undefined
            )
          }
    })
  }

  // The nonce is created before next(): the render reads it from the event,
  // and the CSP of the response carries the same value.
  async function securityHeaders(
    _request: Request,
    next: Next
  ): Promise<Response> {
    requestNonce()
    return applySecurityHeaders(await next())
  }

  return { securityHeaders, applySecurityHeaders }
}
