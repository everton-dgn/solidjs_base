// WHY: JavaScript with a declaration file, because the application's
// vite.config.ts loads these values through Node, which refuses TypeScript
// inside node_modules.

// Default security headers of createSecurityHeaders.
// Cross-Origin-Embedder-Policy requires resources from another origin to
// answer with CORP or CORS; the application's resources are same-origin.
export const SECURITY_HEADERS = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
  'cross-origin-resource-policy': 'same-origin'
}

// Default directives of the Content-Security-Policy. script-src depends on the
// request nonce and is built in applySecurityHeaders. In a build, styles come
// only from a same-origin <link>; a <style> or a style attribute in the HTML
// is blocked. The SSR theme goes through the .light/.dark classes of <html>.
export const CSP_DIRECTIVES = [
  "default-src 'self'",
  "style-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
]
