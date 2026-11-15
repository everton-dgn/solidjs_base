type StoredTheme = 'light' | 'dark' | 'system'

type StoredThemeOptions = {
  storageKey: string
  colors: Record<'light' | 'dark', string>
  defaultTheme: StoredTheme
}

export declare function storedThemeScript({
  storageKey,
  colors,
  defaultTheme
}: StoredThemeOptions): string
