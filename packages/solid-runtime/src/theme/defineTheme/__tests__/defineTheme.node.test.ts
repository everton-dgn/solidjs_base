import { options } from '../../../tests/theme/config.ts'
import { defineTheme } from '../index.ts'

describe('theme configuration', () => {
  it.each([
    [{ cookieName: '' }, 'cookieName'],
    [{ cookieName: 'bad;name' }, 'cookieName'],
    [{ cookieMaxAge: 0 }, 'cookieMaxAge'],
    [{ cookieMaxAge: Infinity }, 'cookieMaxAge'],
    [{ defaultTheme: 'sepia' }, 'defaultTheme'],
    [{ colors: { light: '', dark: '#000' } }, 'colors.light'],
    [{ colors: { light: '#fff' } }, 'colors.dark']
  ])('rejects invalid options %j', (override, field) => {
    expect(() =>
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Exercise untyped consumer input.
      defineTheme({ ...options, ...override } as typeof options)
    ).toThrow(field)
  })

  it('copies configuration and builds a safe inline script', () => {
    const input = {
      ...options,
      colors: { light: '</script>', dark: '#123456' }
    }
    const theme = defineTheme(input)
    input.colors.dark = '#changed'
    expect(theme.themeColor('dark')).toBe('#123456')
    expect(theme.themeColor('system')).toBe('</script>')
    expect(theme.themeScript('system')).not.toContain('</script>')
    expect(theme.themeScript('dark')).toContain('#123456')
    expect(theme.readTheme('app-theme=light')).toBe('light')
  })
})
