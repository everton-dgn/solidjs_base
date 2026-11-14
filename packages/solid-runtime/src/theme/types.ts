import type { ThemeState } from './createTheme/types.ts'

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = Exclude<Theme, 'system'>

export type ThemeOptions = {
  cookieName: string
  cookieMaxAge: number
  colors: Record<ResolvedTheme, string>
  defaultTheme: Theme
}

export type ThemeDefinition = {
  themes: readonly Theme[]
  defaultTheme: Theme
  createTheme: () => ThemeState
  readTheme: (cookieHeader?: string | null) => Theme | null | undefined
  themeColor: (theme: Theme) => string
  themeScript: (theme: Theme) => string
}
