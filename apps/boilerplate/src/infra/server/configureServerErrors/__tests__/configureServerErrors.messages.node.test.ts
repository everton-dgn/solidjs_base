import {
  createPublicError,
  isPublicError,
  publicErrorMessage
} from '@evertondgn/solid-runtime/server/public-errors'
import { m } from '@paraglide/messages.js'
import {
  baseLocale,
  locales,
  getLocale,
  type Locale,
  overwriteGetLocale
} from '@paraglide/runtime.js'
import { paraglideMiddleware } from '@paraglide/server.js'

const message = (locale: Locale) =>
  m.configureServerErrors_message({}, { locale })

describe('application public error messages', () => {
  beforeAll(async () => {
    await import('../index.ts')
  })

  it('uses the base locale outside the Paraglide request context', () => {
    const error = createPublicError()

    expect(error).toStrictEqual(new Error(message(baseLocale)))
    expect(isPublicError(error)).toBe(true)
  })

  it.each(locales)(
    'uses request locale %s inside the locale context',
    async locale => {
      const response = await paraglideMiddleware(
        new Request(`http://localhost/${locale}`),
        () => new Response(createPublicError().message)
      )

      await expect(response.text()).resolves.toBe(message(locale))
    }
  )

  it.each(locales)('accepts explicit locale %s', locale => {
    expect(publicErrorMessage(locale)).toBe(message(locale))
  })

  // The error hook calls this factory synchronously and must never throw.
  it('falls back without throwing when locale resolution fails', () => {
    const resolveLocale = getLocale
    overwriteGetLocale(() => {
      throw new Error('PRIVATE_LOCALE')
    })
    try {
      expect(createPublicError().message).toBe(
        'The request could not be completed.'
      )
    } finally {
      overwriteGetLocale(resolveLocale)
    }
  })
})
