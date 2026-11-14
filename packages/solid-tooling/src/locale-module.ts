import path from 'node:path'

import type { Plugin } from 'vite-plus'

import { hasI18n } from './has-i18n.ts'

type LocaleOptions = { root: string; language?: string }
const MODULE_ID = 'virtual:solid-app/locale'
const RESOLVED_ID = '\0solid-app:locale'

export function localeSource({ root, language = 'en' }: LocaleOptions): string {
  if (hasI18n(root)) {
    return `export { locales, baseLocale, getLocale, extractLocaleFromUrl, localizeHref, deLocalizeUrl } from ${JSON.stringify(path.join(root, 'paraglide/runtime.js'))}`
  }
  return `export const baseLocale = ${JSON.stringify(language)}
export const locales = [baseLocale]
export const getLocale = () => baseLocale
export const extractLocaleFromUrl = () => undefined
export const localizeHref = href => href
export const deLocalizeUrl = url => url instanceof URL ? url : new URL(typeof url === 'string' ? url : url.href)
`
}

export function localeModule(options: LocaleOptions): Plugin {
  return {
    name: 'solid-app:locale',
    resolveId: id => (id === MODULE_ID ? RESOLVED_ID : undefined),
    load: id => (id === RESOLVED_ID ? localeSource(options) : undefined)
  }
}
