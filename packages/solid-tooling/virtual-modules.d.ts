declare module 'virtual:solid-app/fonts' {
  type FontPreload = { href: string; type: string }
  export const stylesheet: string
  export const preloads: readonly FontPreload[]
}

declare module 'virtual:solid-app/seo-origin' {
  export const origin: string
}

declare module 'virtual:solid-app/seo-markdown' {
  type MarkdownConfig = {
    static: boolean
    maxInputBytes: number
    maxOutputBytes: number
    timeoutMs: number
    hasLlms: boolean
  }
  export const markdown: MarkdownConfig
}

declare module 'virtual:solid-app/seo-llms' {
  type LlmsConfig = {
    maxBytes: number
    hasMarkdown: boolean
    hasLlmsFull: boolean
  }
  export const llms: LlmsConfig
}

declare module 'virtual:solid-app/locale-context' {
  type ContextOptions = { url: string; run: () => Response | Promise<Response> }
  export function withLocaleContext(options: ContextOptions): Promise<Response>
  export function requestLocale(request: Request): string
}

declare module 'virtual:solid-app/seo-robots' {
  type RobotsGroup = {
    userAgents: readonly string[]
    allow?: readonly string[]
    disallow?: readonly string[]
  }
  type RobotsConfig = {
    groups: readonly RobotsGroup[]
    sitemaps: readonly string[]
    cacheControl?: string
  }
  export const robots: RobotsConfig
}

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

declare module 'virtual:solid-app/request-middleware' {
  type Security = { applySecurityHeaders: (response: Response) => Response }
  type RequestOptions = { request: Request; next: () => Promise<Response> }
  export function createRequestLocale(
    options: Security
  ): (options: RequestOptions) => Promise<Response>
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
