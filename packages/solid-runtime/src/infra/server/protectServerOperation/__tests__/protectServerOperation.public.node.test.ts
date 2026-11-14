import { redirect } from '@solidjs/web'

import { createPublicError, isPublicError } from '../../publicErrors/index.ts'
import { protectServerOperation } from '../index.ts'

describe('public operation protection', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false)
    vi.spyOn(console, 'error').mockReturnValue()
  })

  it('keeps synchronous data and asynchronous data', async () => {
    const data = { ok: true }
    expect(protectServerOperation({ run: () => data })).toBe(data)
    await expect(
      protectServerOperation({ run: () => Promise.resolve(data) })
    ).resolves.toBe(data)
  })

  it('shares public error identity with the internal protection', () => {
    const original = Object.assign(createPublicError(), {
      cause: 'PRIVATE',
      extra: 'PRIVATE'
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
    expect(console.error).not.toHaveBeenCalled()
  })

  it('cannot enable control responses even through untyped options', () => {
    const options = { run: () => redirect('/private'), allowControl: true }
    // @ts-expect-error JavaScript callers cannot enable the internal option.
    expect(() => protectServerOperation(options)).toThrow(
      'The request could not be completed.'
    )
  })
})
