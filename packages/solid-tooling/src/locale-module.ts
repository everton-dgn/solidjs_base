import path from 'node:path'

import type { Plugin } from 'vite-plus'

import { hasI18n } from './has-i18n.ts'

type LocaleOptions = { root: string; language?: string }
const MODULE_ID = 'virtual:solid-app/locale'
const RESOLVED_ID = '\0solid-app:locale'

function localeRequestSource({ root }: LocaleOptions): string {
  if (hasI18n(root)) {
    return `export { shouldRedirect, extractLocaleFromRequest, cookieName, cookieMaxAge, cookieDomain, cookieSameSite, cookieSecure } from ${JSON.stringify(path.join(root, 'paraglide/runtime.js'))}; export { paraglideMiddleware } from ${JSON.stringify(path.join(root, 'paraglide/server.js'))}`
  }
  return `const missing = () => { throw new Error('Locale requests require project.inlang/settings.json') }; export { missing as shouldRedirect, missing as extractLocaleFromRequest, missing as paraglideMiddleware }; export const cookieName = '', cookieMaxAge = 0, cookieDomain = '', cookieSameSite = 'lax', cookieSecure = false`
}

export function localeSource({ root, language = 'en' }: LocaleOptions): string {
  if (hasI18n(root)) {
    return `export { locales, baseLocale, getLocale, setLocale, extractLocaleFromUrl, localizeHref, deLocalizeUrl } from ${JSON.stringify(path.join(root, 'paraglide/runtime.js'))}`
  }
  return `export const baseLocale = ${JSON.stringify(language)}
export const locales = [baseLocale]
export const getLocale = () => baseLocale
export const setLocale = () => undefined
export const extractLocaleFromUrl = () => undefined
export const localizeHref = href => href
export const deLocalizeUrl = url => url instanceof URL ? url : new URL(typeof url === 'string' ? url : url.href)
`
}

export function localeModule(options: LocaleOptions): Plugin {
  return {
    name: 'solid-app:locale',
    resolveId: id => {
      if (id === 'virtual:solid-app/request-middleware') {
        return '\0solid-app:request-middleware'
      }
      if (id === 'virtual:solid-app/locale-request') {
        return '\0solid-app:locale-request'
      }
      return id === MODULE_ID ? RESOLVED_ID : undefined
    },
    load: id => {
      if (id === '\0solid-app:request-middleware') {
        // Keep the request provider out of applications without translations.
        return hasI18n(options.root)
          ? "export { createLocalizeRequest as createRequestLocale } from '@evertondgn/solid-runtime/middleware/localize-request'"
          : 'export const createRequestLocale = () => ({ next }) => next()'
      }
      if (id === '\0solid-app:locale-request') {
        return localeRequestSource(options)
      }
      return id === RESOLVED_ID ? localeSource(options) : undefined
    }
  }
}
