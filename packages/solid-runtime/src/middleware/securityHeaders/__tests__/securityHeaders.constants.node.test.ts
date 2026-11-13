import { CSP_DIRECTIVES, SECURITY_HEADERS } from '../constants.js'

// WHY: constants.d.ts is written by hand next to constants.js. The annotations
// fail the type check when the declarations drift from these literals, and the
// assertions fail when the values do.
const EXPECTED_HEADERS: typeof SECURITY_HEADERS = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
  'cross-origin-resource-policy': 'same-origin'
}
const EXPECTED_DIRECTIVES: typeof CSP_DIRECTIVES = [
  "default-src 'self'",
  "style-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
]

describe('security header constants', () => {
  it('exports the header values that the declaration file describes', () => {
    expect(SECURITY_HEADERS).toStrictEqual(EXPECTED_HEADERS)
  })

  it('exports the CSP directives that the declaration file describes', () => {
    expect(CSP_DIRECTIVES).toStrictEqual(EXPECTED_DIRECTIVES)
  })
})
