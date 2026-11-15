import { clearThemeCookie } from '../../../tests/theme/clear-theme-cookie.ts'
import {
  THEME_STORAGE_KEY,
  localOptions
} from '../../../tests/theme/local-config.ts'
import { readTheme, saveTheme } from '../index.ts'

function blocked(): never {
  throw new Error('blocked')
}

describe('localStorage preference persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    clearThemeCookie()
  })

  it.each(['light', 'dark', 'system'] as const)(
    'writes and reads %s without a cookie',
    theme => {
      expect(saveTheme(localOptions, theme)).toBe(true)
      expect(readTheme(localOptions)).toBe(theme)
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(theme)
      expect(document.cookie).toBe('')
    }
  )

  it('reads a missing or invalid value as no preference', () => {
    expect(readTheme(localOptions)).toBeNull()
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia')
    expect(readTheme(localOptions)).toBeNull()
  })

  it('ignores the cookie header', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    expect(readTheme(localOptions, `${THEME_STORAGE_KEY}=dark`)).toBe('light')
  })

  it('detects a silently rejected write', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: vi.fn<() => void>()
    })
    expect(saveTheme(localOptions, 'dark')).toBe(false)
    expect(readTheme(localOptions)).toBeNull()
  })

  it('tolerates read and write exceptions', () => {
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked })
    expect(readTheme(localOptions)).toBeUndefined()
    expect(saveTheme(localOptions, 'dark')).toBe(false)
  })
})
