// The application generates this module with Paraglide; the browser setup only
// needs these two members.
declare module '@paraglide/runtime.js' {
  type SetLocaleOptions = { reload?: boolean }

  export const baseLocale: string
  export function setLocale(locale: string, options?: SetLocaleOptions): void
}
