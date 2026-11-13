import {
  CSP_DIRECTIVES as PACKAGE_CSP_DIRECTIVES,
  SECURITY_HEADERS as PACKAGE_SECURITY_HEADERS
} from '@evertondgn/solid-runtime/middleware/security-headers/constants'

// The application changes a header or a CSP directive here. vite.config.ts
// loads this module through Node, so it holds only data.
export const SECURITY_HEADERS = { ...PACKAGE_SECURITY_HEADERS }

export const CSP_DIRECTIVES = [...PACKAGE_CSP_DIRECTIVES]
