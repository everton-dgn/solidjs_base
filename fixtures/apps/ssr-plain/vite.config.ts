import { SECURITY_HEADERS } from '@evertondgn/solid-runtime/middleware/security-headers/constants'
import { defineSolidApp } from '@evertondgn/solid-tooling/vite'

export default defineSolidApp({
  root: import.meta.dirname,
  serverSetup: './src/infra/server/configureServerErrors/index.ts',
  securityHeaders: SECURITY_HEADERS,
  middleware: './src/middleware.ts'
})
