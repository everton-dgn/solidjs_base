import { baseLocale, locales, type Locale } from '@paraglide/runtime.js'

import { LOCALE_TAG_OVERRIDES } from '@/i18n/localeTagOverrides/index.ts'

const alternate = locales.find(locale => locale !== baseLocale) ?? baseLocale
const tags: Readonly<Record<string, string>> = LOCALE_TAG_OVERRIDES

export const testLocale = {
  hasPrefix: true,
  base: baseLocale,
  alternate,
  locales,
  header: (locale: Locale): string => locale,
  tag: (locale: Locale): string => tags[locale] ?? locale,
  path: (locale: string, suffix: string): string => `/${locale}${suffix}`
}
