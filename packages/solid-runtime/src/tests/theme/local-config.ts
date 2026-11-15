import { defineTheme } from '../../theme/defineTheme/index.ts'
import type { LocalStorageThemeOptions } from '../../theme/types.ts'

export const THEME_STORAGE_KEY = 'app-theme-choice'
export const localOptions: LocalStorageThemeOptions = {
  storage: 'local-storage',
  storageKey: THEME_STORAGE_KEY,
  defaultTheme: 'system',
  colors: { light: '#ffffff', dark: '#09090b' }
}
export const localTheme = defineTheme(localOptions)
