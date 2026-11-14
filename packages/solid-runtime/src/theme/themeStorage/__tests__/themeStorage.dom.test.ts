import { blockCookie } from '../../../tests/theme/block-cookie.ts'
import { clearThemeCookie } from '../../../tests/theme/clear-theme-cookie.ts'
import { readTheme, saveTheme } from '../../../tests/theme/config.ts'

describe('cookie preference persistence', () => {
  beforeEach(clearThemeCookie)

  it.each(['light', 'dark', 'system'] as const)(
    'writes and reads %s',
    theme => {
      expect(saveTheme(theme)).toBe(true)
      expect(readTheme()).toBe(theme)
    }
  )

  it.each(['light', 'system'] as const)(
    'detects silent rejection of %s without a previous cookie',
    theme => {
      vi.spyOn(document, 'cookie', 'set').mockImplementation(
        vi.fn<() => void>()
      )
      expect(saveTheme(theme)).toBe(false)
      expect(document.cookie).toBe('')
    }
  )

  it('detects blocked writes retaining the previous cookie', () => {
    saveTheme('light')
    vi.spyOn(document, 'cookie', 'set').mockImplementation(vi.fn<() => void>())
    expect(saveTheme('dark')).toBe(false)
    expect(readTheme()).toBe('light')
  })

  it('tolerates read and write exceptions', () => {
    blockCookie()
    expect(readTheme()).toBeUndefined()
    expect(saveTheme('dark')).toBe(false)
  })

  it('restricts the cookie to the host and uses Secure on HTTPS', () => {
    vi.stubGlobal('location', { protocol: 'https:' })
    const write = vi
      .spyOn(document, 'cookie', 'set')
      .mockImplementation(vi.fn<() => void>())
    saveTheme('dark')
    expect(write).toHaveBeenCalledExactlyOnceWith(
      'app-theme=dark; Path=/; Max-Age=31536000; Secure; SameSite=Lax'
    )
  })
})
