import type { ParaglideConfig } from '@inlang/paraglide-js'

type LocalizedPattern = [string, string]

// WHY: every locale keeps a URL prefix, because the preset writes the static
// Markdown files and their headers per locale folder (docs/security.md of the
// boilerplate app). A config without that prefix needs its own patterns.
export function defineParaglideConfig(
  locales: readonly string[]
): ParaglideConfig {
  return {
    outdir: './paraglide',
    emitTsDeclarations: true,
    outputStructure: 'message-modules',
    strategy: ['url', 'cookie', 'preferredLanguage', 'baseLocale'],
    cookieName: 'locale',
    cookieSameSite: 'lax',
    cookieSecure: 'auto',
    trailingSlash: 'never',
    urlPatterns: [
      {
        pattern: '/',
        localized: locales.map((locale): LocalizedPattern => [
          locale,
          `/${locale}`
        ])
      },
      {
        pattern: '/:path(.*)?',
        localized: locales.map((locale): LocalizedPattern => [
          locale,
          `/${locale}/:path(.*)?`
        ])
      }
    ],
    lazyUrlPatternPolyfill: true,
    emitReadme: false,
    emitPrettierIgnore: false
  }
}
