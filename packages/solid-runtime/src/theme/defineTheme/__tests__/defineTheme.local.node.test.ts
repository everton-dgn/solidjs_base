import { options } from '../../../tests/theme/config.ts'
import { localOptions } from '../../../tests/theme/local-config.ts'
import { defineTheme } from '../index.ts'

describe('localStorage theme configuration', () => {
  it.each([
    [{ storageKey: '' }, 'storageKey'],
    [{ storageKey: 1 }, 'storageKey'],
    [{ defaultTheme: 'sepia' }, 'defaultTheme'],
    [{ colors: { light: '#fff', dark: ' ' } }, 'colors.dark']
  ])('rejects invalid options %j', (override, field) => {
    expect(() =>
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Exercise untyped consumer input.
      defineTheme({ ...localOptions, ...override } as typeof localOptions)
    ).toThrow(field)
  })

  it('rejects an unknown storage', () => {
    expect(() =>
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Exercise untyped consumer input.
      defineTheme({
        ...options,
        storage: 'session'
      } as unknown as typeof options)
    ).toThrow('storage must be cookie or local-storage')
  })

  it('accepts the cookie storage by name and without it', () => {
    expect(defineTheme({ ...options, storage: 'cookie' }).defaultTheme).toBe(
      'system'
    )
    expect(defineTheme(options).readTheme('app-theme=dark')).toBe('dark')
  })

  it('needs no cookie fields and reads nothing without a browser', () => {
    const theme = defineTheme(localOptions)
    expect(theme.themeColor('dark')).toBe('#09090b')
    expect(theme.readTheme('app-theme-choice=dark')).toBeUndefined()
  })
})
