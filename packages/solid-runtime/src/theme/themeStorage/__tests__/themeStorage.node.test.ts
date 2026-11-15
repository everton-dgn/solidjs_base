import { readTheme } from '../../../tests/theme/config.ts'

describe('request cookie preference', () => {
  it.each([
    [null, null],
    ['', null],
    ['app-theme=dark', 'dark'],
    ['app-theme=light', 'light'],
    ['app-theme=system', 'system'],
    ['other=value; app-theme=%64ark; another=value', 'dark'],
    ['app-theme=invalid', null],
    ['app-theme=%E0%A4%A', null],
    ['other-app-theme=dark', null]
  ])('resolves %s as %s without browser access', (header, expected) => {
    expect(readTheme(header)).toBe(expected)
  })
})
