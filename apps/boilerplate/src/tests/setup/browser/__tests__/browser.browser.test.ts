import {
  baseLocale,
  getLocale,
  locales,
  setLocale
} from '@paraglide/runtime.js'

const alternate = locales.find(locale => locale !== baseLocale) ?? baseLocale

describe('locale isolation between browser tests', () => {
  beforeAll(() => setLocale(alternate, { reload: false }))

  afterAll(() => setLocale(baseLocale, { reload: false }))

  it('starts in the base locale even with an earlier preference', () => {
    expect(getLocale()).toBe(baseLocale)
    void setLocale(alternate, { reload: false })
    expect(getLocale()).toBe(alternate)
  })

  it('drops the preference written by the earlier test', () => {
    expect(getLocale()).toBe(baseLocale)
  })
})
