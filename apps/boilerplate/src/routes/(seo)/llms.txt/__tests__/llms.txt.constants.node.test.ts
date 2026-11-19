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
})
