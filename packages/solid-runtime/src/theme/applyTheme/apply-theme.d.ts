type AppliedTheme = {
  theme: 'light' | 'dark'
  color: string
}

export declare function applyTheme({ theme, color }: AppliedTheme): void
