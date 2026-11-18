import { defineTheme } from '@evertondgn/solid-runtime/theme/define-theme'

export const { readTheme, themeColor, themeScript, defaultTheme } = defineTheme(
  {
    cookieName: 'scenario-theme',
    colors: { light: '#ffffff', dark: '#09090b' }
  }
)
