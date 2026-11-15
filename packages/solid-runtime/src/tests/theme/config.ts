import { defineTheme } from '../../theme/defineTheme/index.ts'
import { makeThemeChannel as connect } from '../../theme/makeThemeChannel/index.ts'
import { saveTheme as save } from '../../theme/themeStorage/index.ts'
import type { Theme, ThemeOptions } from '../../theme/types.ts'

export const THEME_COOKIE_NAME = 'app-theme'
export const options: ThemeOptions = {
  cookieName: THEME_COOKIE_NAME,
  cookieMaxAge: 31_536_000,
  defaultTheme: 'system',
  colors: { light: '#ffffff', dark: '#09090b' }
}
export const { createTheme, readTheme } = defineTheme(options)
export const saveTheme = (theme: Theme): boolean => save(options, theme)
export const makeThemeChannel = (
  receive: (theme: Theme) => void
): ReturnType<typeof connect> => connect(options, receive)
