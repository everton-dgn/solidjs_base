declare module 'virtual:solid-app/locale' {
  type UrlInput = string | { readonly href: string }
  type LocalizeOptions = { locale?: string }
  type SetLocaleOptions = { reload?: boolean }
  export const locales: readonly string[]
  export const baseLocale: string
  export function getLocale(): string
  export function setLocale(
    locale: string,
    options?: SetLocaleOptions
  ): void | Promise<void>
  export function extractLocaleFromUrl(url: URL | string): string | undefined
  export function localizeHref(href: string, options?: LocalizeOptions): string
  export function deLocalizeUrl(url: UrlInput): URL
}

declare module 'virtual:solid-app/locale-request' {
  type Decision = { shouldRedirect: boolean; redirectUrl?: URL; locale: string }
  type Options = { request: Request }
  type Context = { locale: string; request: Request }
  export function shouldRedirect(options: Options): Promise<Decision>
  export function extractLocaleFromRequest(request: Request): string
  export function paraglideMiddleware(
    request: Request,
    next: (context: Context) => Promise<Response>
  ): Promise<Response>
  export const cookieName: string
  export const cookieMaxAge: number
  export const cookieDomain: string
  export const cookieSameSite: 'lax' | 'strict' | 'none'
  export const cookieSecure: boolean | 'auto'
}
