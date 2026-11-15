import type { Accessor } from 'solid-js'

import type { ResolvedTheme, Theme } from '../types.ts'

export type ThemeState = {
  theme: Accessor<Theme>
  resolvedTheme: Accessor<ResolvedTheme>
  isReady: Accessor<boolean>
  setTheme: (theme: Theme) => void
}
