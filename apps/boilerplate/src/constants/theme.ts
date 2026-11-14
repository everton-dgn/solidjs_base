import { defineTheme } from '@evertondgn/solid-runtime/theme/define-theme'

const THEME_COOKIE_MAX_AGE = 31_536_000
const THEME_COLORS = { light: '#ffffff', dark: '#09090b' }

const THEME_COOKIE_NAME = 'app-theme'
export const {
  createTheme,
  readTheme,
  themeColor,
  themeScript,
  defaultTheme: DEFAULT_THEME,
  themes: THEMES
} = defineTheme({
  cookieName: THEME_COOKIE_NAME,
  cookieMaxAge: THEME_COOKIE_MAX_AGE,
  colors: THEME_COLORS,
  defaultTheme: 'system'
})
