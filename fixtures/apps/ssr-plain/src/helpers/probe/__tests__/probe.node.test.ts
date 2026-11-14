import { SECURITY_HEADERS } from '@evertondgn/solid-runtime/middleware/security-headers/constants'
import { describe, expect, it } from 'vite-plus/test'

describe('installed runtime', () => {
  it('loads the security headers', () => {
    expect(SECURITY_HEADERS['x-content-type-options']).toBe('nosniff')
  })
})
