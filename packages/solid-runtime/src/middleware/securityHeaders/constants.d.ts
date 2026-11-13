export declare const SECURITY_HEADERS: {
  readonly 'strict-transport-security': 'max-age=63072000; includeSubDomains'
  readonly 'x-frame-options': 'DENY'
  readonly 'x-content-type-options': 'nosniff'
  readonly 'referrer-policy': 'strict-origin-when-cross-origin'
  readonly 'permissions-policy': 'camera=(), microphone=(), geolocation=()'
  readonly 'cross-origin-opener-policy': 'same-origin'
  readonly 'cross-origin-embedder-policy': 'require-corp'
  readonly 'cross-origin-resource-policy': 'same-origin'
}
export declare const CSP_DIRECTIVES: readonly [
  "default-src 'self'",
  "style-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
]
