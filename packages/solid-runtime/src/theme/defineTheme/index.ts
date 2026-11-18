import { applyTheme } from '../applyTheme/index.ts'
import { DARK_MEDIA_QUERY, THEMES } from '../constants.ts'
import { createTheme } from '../createTheme/index.ts'
import { isTheme } from '../isTheme/index.ts'
import { readTheme } from '../themeStorage/index.ts'
import type {
  Theme,
  ThemeConfig,
  ThemeDefinition,
  ThemeInput
} from '../types.ts'

const DEFAULT_THEME = 'system'
const ONE_YEAR_IN_SECONDS = 31_536_000

function serialize(value: string): string {
  return JSON.stringify(value).replaceAll('<', String.raw`\u003c`)
}

function validateStorage(input: ThemeConfig): void {
  if (input.storage === 'local-storage') {
    if (typeof input.storageKey !== 'string' || !input.storageKey) {
      throw new Error('storageKey must be a nonempty string')
    }
    return
  }
  // oxlint-disable-next-line typescript/no-unnecessary-condition -- Validate untyped callers at the public boundary.
  if (input.storage !== undefined && input.storage !== 'cookie') {
    throw new Error('storage must be cookie or local-storage')
  }
  if (
    !input.cookieName ||
    !/^[!#$%&'*+.^_`|~a-zA-Z0-9-]+$/u.test(input.cookieName)
  ) {
    throw new Error('cookieName must be a nonempty cookie token')
  }
  if (!Number.isSafeInteger(input.cookieMaxAge) || input.cookieMaxAge <= 0) {
    throw new Error('cookieMaxAge must be a positive safe integer')
  }
}

// Only an omitted option takes its default, so an invalid value still fails
// the validation below.
function withDefaults(input: ThemeInput): ThemeConfig {
  const defaultTheme = input.defaultTheme ?? DEFAULT_THEME
  if (input.storage === 'local-storage') return { ...input, defaultTheme }
  return {
    ...input,
    cookieMaxAge: input.cookieMaxAge ?? ONE_YEAR_IN_SECONDS,
    defaultTheme
  }
}

export function defineTheme(themeInput: ThemeInput): ThemeDefinition {
  const input = withDefaults(themeInput)
  validateStorage(input)
  if (!isTheme(input.defaultTheme)) {
    throw new Error('defaultTheme must be light, dark or system')
  }
  for (const key of ['light', 'dark'] as const) {
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- Validate untyped callers at the public boundary.
    if (typeof input.colors?.[key] !== 'string' || !input.colors[key].trim()) {
      throw new Error(`colors.${key} must be a nonempty color`)
    }
  }
  const options = { ...input, colors: { ...input.colors } }
  return {
    themes: THEMES,
    defaultTheme: options.defaultTheme,
    createTheme: (): ReturnType<typeof createTheme> => createTheme(options),
    readTheme: (cookieHeader?: string | null): Theme | null | undefined =>
      readTheme(options, cookieHeader),
    themeColor: (theme: Theme): string =>
      options.colors[theme === 'system' ? 'light' : theme],
    themeScript(theme: Theme): string {
      return `(() => {
        const theme = ${serialize(theme)};
        const dark = theme === 'dark' || (theme === 'system' && matchMedia(${serialize(DARK_MEDIA_QUERY)}).matches);
        (${applyTheme.toString()})({ theme: dark ? 'dark' : 'light', color: dark ? ${serialize(options.colors.dark)} : ${serialize(options.colors.light)} });
      })();`
    }
  }
}
