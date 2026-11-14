import {
  createPublicError,
  isPublicError,
  publicErrorMessage
} from '@evertondgn/solid-runtime/server/public-errors'
import {
  getLocale,
  type Locale,
  overwriteGetLocale
} from '@paraglide/runtime.js'
import { paraglideMiddleware } from '@paraglide/server.js'

const MESSAGES = {
  pt: 'Não foi possível concluir a solicitação.',
  en: 'The request could not be completed.',
  es: 'No se pudo completar la solicitud.'
} satisfies Record<Locale, string>
const LOCALES: Locale[] = ['pt', 'en', 'es']

describe('application public error messages', () => {
  beforeAll(async () => {
    await import('../index.ts')
  })

  it('uses the base locale outside the Paraglide request context', () => {
    const error = createPublicError()

    expect(error).toStrictEqual(new Error(MESSAGES.en))
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
      expect(createPublicError().message).toBe(MESSAGES.en)
    } finally {
      overwriteGetLocale(resolveLocale)
    }
  })
})
