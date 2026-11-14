declare module 'virtual:solid-app/locale' {
  type UrlInput = string | { readonly href: string }
  type LocalizeOptions = { locale?: string }
  export const locales: readonly string[]
  export const baseLocale: string
  export function getLocale(): string
  export function extractLocaleFromUrl(url: URL | string): string | undefined
  export function localizeHref(href: string, options?: LocalizeOptions): string
  export function deLocalizeUrl(url: UrlInput): URL
}
