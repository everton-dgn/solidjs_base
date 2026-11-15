import { configureServerErrors } from '@evertondgn/solid-runtime/server/configure-server-errors'
import { protectServerOperation } from '@evertondgn/solid-runtime/server/protect-server-operation'
import {
  createPublicError,
  isPublicError,
  publicErrorMessage
} from '@evertondgn/solid-runtime/server/public-errors'
import { createRenderIntegrity } from '@evertondgn/solid-runtime/server/render-integrity'

describe('installed server errors', () => {
  beforeEach(() => {
    configureServerErrors()
    vi.stubEnv('DEV', false)
  })

  it('shares error identity and observes renders through the public subpaths', () => {
    const log = vi.spyOn(console, 'error').mockReturnValue()
    const original = Object.assign(createPublicError(), {
      extra: 'PRIVATE_SCENARIO'
    })
    let replacement: unknown
    try {
      protectServerOperation({
        run: () => {
          throw original
        }
      })
    } catch (error) {
      replacement = error
    }
    expect(replacement).not.toBe(original)
    expect(replacement).toStrictEqual(
      new Error('The request could not be completed.')
    )
    expect(isPublicError(replacement)).toBe(true)
    expect(log).not.toHaveBeenCalled()
    expect(createRenderIntegrity().state.hasErrors).toBe(false)
  })

  it('contains a throwing callback synchronously', () => {
    const log = vi.spyOn(console, 'error').mockReturnValue()
    configureServerErrors({
      publicMessage: () => {
        throw new Error('CALLBACK_PRIVATE_SCENARIO')
      }
    })
    expect(publicErrorMessage()).toBe('The request could not be completed.')
    expect(createPublicError()).toStrictEqual(
      new Error('The request could not be completed.')
    )
    expect(log).not.toHaveBeenCalled()
  })
})
