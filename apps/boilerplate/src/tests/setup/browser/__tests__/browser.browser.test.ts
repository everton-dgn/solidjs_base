import { baseLocale, getLocale, setLocale } from '@paraglide/runtime.js'

import { testLanguages } from '@/tests/helpers/testLanguages/index.ts'

const { alternate } = testLanguages

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
