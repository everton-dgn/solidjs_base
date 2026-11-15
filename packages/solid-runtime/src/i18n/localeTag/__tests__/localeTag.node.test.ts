import { localeTag } from '../index.ts'

describe('locale tags', () => {
  it.each([
    ['de', 'de'],
    ['fr-ca', 'fr-CA'],
    ['ja', 'ja'],
    ['zh-hant-tw', 'zh-Hant-TW'],
    ['sr-latn-rs', 'sr-Latn-RS'],
    ['ar-eg-u-nu-latn', 'ar-EG-u-nu-latn']
  ])(
    'canonicalizes %s as %s without a fixed locale list',
    (locale, expected) => {
      expect(localeTag(locale)).toBe(expected)
    }
  )

  it('uses the active provider locale when omitted', () => {
    expect(localeTag()).toBe('fr')
  })

  it('applies optional regional overrides without mutating the map', () => {
    const overrides = Object.freeze({ de: 'de-ch', ja: 'ja-JP' })
    expect(localeTag('de', overrides)).toBe('de-CH')
    expect(localeTag('ja', overrides)).toBe('ja-JP')
    expect(localeTag('fr', overrides)).toBe('fr')
    expect(overrides).toStrictEqual({ de: 'de-ch', ja: 'ja-JP' })
  })

  it('preserves the application regional choices', () => {
    const overrides = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' }
    expect(
      ['pt', 'en', 'es'].map(locale => localeTag(locale, overrides))
    ).toStrictEqual(['pt-BR', 'en-US', 'es-ES'])
  })

  it('rejects malformed tags and overrides through Intl.Locale', () => {
    expect(() => localeTag('invalid_tag')).toThrow(RangeError)
    expect(() => localeTag('de', { de: 'invalid_tag' })).toThrow(RangeError)
  })
})
