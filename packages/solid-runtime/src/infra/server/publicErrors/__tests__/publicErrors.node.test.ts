import {
  getLocale,
  isLocale,
  type Locale,
  overwriteGetLocale
} from '@paraglide/runtime.js'
import { paraglideMiddleware } from '@paraglide/server.js'

import { configureServerErrors } from '../../configureServerErrors/index.ts'
import {
  createPublicError,
  isPublicError,
  publicErrorMessage
} from '../index.ts'

vi.mock(import('@/i18n/locale/index.ts'), async () => {
  const runtime = await import('@paraglide/runtime.js')
  return { getLocale: () => runtime.getLocale() }
})

const DEFAULT_MESSAGE = 'The request could not be completed.'
const MESSAGES = {
  de: 'Die Anfrage konnte nicht abgeschlossen werden.',
  fr: 'La demande n’a pas pu être traitée.',
  ja: 'リクエストを完了できませんでした。'
} satisfies Record<Locale, string>
const LOCALES: Locale[] = ['fr', 'de', 'ja']

describe('public error messages', () => {
  beforeEach(() => {
    configureServerErrors({
      publicMessage: locale => {
        if (!isLocale(locale)) throw new Error('PRIVATE_LOCALE')
        return MESSAGES[locale]
      }
    })
  })

  it('uses the base locale outside the Paraglide request context', () => {
    const error = createPublicError()

    expect(error).toStrictEqual(new Error(MESSAGES.de))
    expect(isPublicError(error)).toBe(true)
  })

  it.each(LOCALES)(
    'uses request locale %s inside the locale context',
    async locale => {
      const response = await paraglideMiddleware(
        new Request(`http://localhost/${locale}`),
        () => new Response(createPublicError().message)
      )

      await expect(response.text()).resolves.toBe(MESSAGES[locale])
    }
  )

  it.each(LOCALES)('accepts explicit locale %s', locale => {
    expect(publicErrorMessage(locale)).toBe(MESSAGES[locale])
  })

  // The error hook calls this factory synchronously and must never throw.
  it('falls back without throwing when locale resolution fails', () => {
    const resolveLocale = getLocale
    overwriteGetLocale(() => {
      throw new Error('PRIVATE_LOCALE')
    })
    try {
      expect(createPublicError().message).toBe(DEFAULT_MESSAGE)
    } finally {
      overwriteGetLocale(resolveLocale)
    }
  })

  it('uses the English default without a callback and resets a previous callback', () => {
    configureServerErrors()
    expect(createPublicError()).toStrictEqual(new Error(DEFAULT_MESSAGE))
    expect(publicErrorMessage('de')).toBe(DEFAULT_MESSAGE)
  })

  it('contains callback failures synchronously without logging or reusing them', () => {
    const failure = Object.assign(new Error('PRIVATE_CALLBACK'), {
      cause: 'PRIVATE_CAUSE'
    })
    const log = vi.spyOn(console, 'error').mockReturnValue()
    configureServerErrors({
      publicMessage: () => {
        throw failure
      }
    })
    expect(publicErrorMessage()).toBe(DEFAULT_MESSAGE)
    const error = createPublicError()
    expect(error).not.toBe(failure)
    expect(error).toStrictEqual(new Error(DEFAULT_MESSAGE))
    expect(isPublicError(error)).toBe(true)
    expect(log).not.toHaveBeenCalled()
  })

  it.each(['', undefined, null, 1, Promise.resolve('PRIVATE_ASYNC')])(
    'uses the default for an invalid callback result: %s',
    result => {
      // JavaScript callers can violate the synchronous string contract.
      // @ts-expect-error Invalid return values exercise the runtime boundary.
      configureServerErrors({ publicMessage: () => result })
      expect(publicErrorMessage()).toBe(DEFAULT_MESSAGE)
      expect(createPublicError()).toStrictEqual(new Error(DEFAULT_MESSAGE))
    }
  )

  it('rejects unrelated, null and hostile objects as public errors', () => {
    expect(isPublicError(null)).toBe(false)
    expect(isPublicError('public')).toBe(false)
    expect(isPublicError(new Error(DEFAULT_MESSAGE))).toBe(false)
    expect(
      isPublicError(
        new Proxy(
          {},
          {
            getPrototypeOf() {
              throw new Error('PRIVATE')
            }
          }
        )
      )
    ).toBe(false)
  })
})
