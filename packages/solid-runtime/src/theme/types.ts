import type { ThemeState } from './createTheme/types.ts'

type CookieThemeInput = Omit<ThemeOptions, 'cookieMaxAge' | 'defaultTheme'> & {
  cookieMaxAge?: number
  defaultTheme?: Theme
}

type LocalStorageThemeInput = Omit<LocalStorageThemeOptions, 'defaultTheme'> & {
  defaultTheme?: Theme
}

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = Exclude<Theme, 'system'>

export type ThemeOptions = {
  storage?: 'cookie'
  cookieName: string
  cookieMaxAge: number
  colors: Record<ResolvedTheme, string>
  defaultTheme: Theme
}

export type LocalStorageThemeOptions = {
  storage: 'local-storage'
  storageKey: string
  colors: Record<ResolvedTheme, string>
  defaultTheme: Theme
}

export type ThemeConfig = ThemeOptions | LocalStorageThemeOptions

export type ThemeInput = CookieThemeInput | LocalStorageThemeInput

export type ThemeDefinition = {
  themes: readonly Theme[]
  defaultTheme: Theme
  createTheme: () => ThemeState
  readTheme: (cookieHeader?: string | null) => Theme | null | undefined
  themeColor: (theme: Theme) => string
  themeScript: (theme: Theme) => string
}
