import { SECURITY_HEADERS } from '@evertondgn/solid-runtime/middleware/security-headers/constants'
import { defineSolidApp } from '@evertondgn/solid-tooling/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'

export default defineSolidApp({
  root: import.meta.dirname,
  securityHeaders: SECURITY_HEADERS,
  middleware: './src/middleware.ts',
  publication: true,
  extend: () => ({
    plugins: [paraglideVitePlugin({ project: './project.inlang' })]
  })
})
