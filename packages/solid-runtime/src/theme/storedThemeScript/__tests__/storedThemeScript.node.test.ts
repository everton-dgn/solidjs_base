import { localOptions } from '../../../tests/theme/local-config.ts'
import { DARK_MEDIA_QUERY, THEMES } from '../../constants.ts'
import { storedThemeScript } from '../index.js'

describe('stored theme script options', () => {
  it('repeats the themes and the media query of the runtime', () => {
    const script = storedThemeScript(localOptions)
    expect(script).toContain(JSON.stringify(THEMES))
    expect(script).toContain(JSON.stringify(DARK_MEDIA_QUERY))
  })

  it('escapes values that could close a script element', () => {
    const script = storedThemeScript({
      ...localOptions,
      storageKey: '</script>',
      colors: { light: '</script>', dark: '#000' }
    })
    expect(script).not.toContain('</script>')
  })

  it.each([
    [{ storageKey: '' }, 'storageKey'],
    [{ defaultTheme: 'sepia' }, 'defaultTheme'],
    [{ colors: { light: '#fff' } }, 'colors.dark']
  ])('rejects invalid options %j', (override, field) => {
    expect(() =>
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Exercise untyped consumer input.
      storedThemeScript({ ...localOptions, ...override } as typeof localOptions)
    ).toThrow(field)
  })
})
