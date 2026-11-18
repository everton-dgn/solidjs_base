import { defineTheme } from '@evertondgn/solid-runtime/theme/define-theme'

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
  colors: THEME_COLORS
})
