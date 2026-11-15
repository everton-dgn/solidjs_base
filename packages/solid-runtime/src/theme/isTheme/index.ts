import { THEMES } from '../constants.ts'
import type { Theme } from '../types.ts'

const themeValues: readonly unknown[] = THEMES

export function isTheme(value: unknown): value is Theme {
  return themeValues.includes(value)
}
