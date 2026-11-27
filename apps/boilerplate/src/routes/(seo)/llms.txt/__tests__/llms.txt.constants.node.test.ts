import { LLMS_NOTES } from '../constants.ts'

vi.mock(import('@paraglide/runtime.js'), (): Record<string, unknown> => ({
  baseLocale: 'en',
  locales: ['pt', 'en', 'es']
}))
vi.mock(import('@evertondgn/solid-runtime/i18n/urls'), () => ({
  localizeHref: ({ locale }) => `/${locale}`
}))

describe('llms.txt notes', () => {
  it('names the available languages with the base language first', () => {
    expect(LLMS_NOTES[0]).toBe(
      'Content is available in English (/en), Portuguese (/pt), and Spanish (/es). This index uses English.'
    )
  })

  it('uses the language tag when Intl rejects its display name', async () => {
    vi.resetModules()
    vi.spyOn(Intl.DisplayNames.prototype, 'of').mockImplementationOnce(() => {
      throw new RangeError('Unsupported locale')
    })
    const { LLMS_NOTES: notes } = await import('../constants.ts')
    expect(notes[0]).toContain('This index uses en.')
  })
})
