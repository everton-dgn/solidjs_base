import { m } from '@paraglide/messages.js'
import { baseLocale, locales, type Locale } from '@paraglide/runtime.js'

import { LOCALE_NAMES as names } from '@/components/molecules/LocaleSwitcher/constants.ts'
import { LOCALE_TAG_OVERRIDES } from '@/i18n/localeTagOverrides/index.ts'

const alternate = locales.find(locale => locale !== baseLocale) ?? baseLocale
const tags: Readonly<Record<string, string>> = LOCALE_TAG_OVERRIDES

const routing = {
  hasPrefix: true,
  base: baseLocale,
  alternate,
  locales,
  header: (locale: Locale): string => locale,
  tag: (locale: Locale): string => tags[locale] ?? locale,
  path: (locale: string, suffix: string): string => `/${locale}${suffix}`
}

const { base, tag } = routing
const third =
  locales.find(locale => locale !== base && locale !== alternate) ?? alternate
const other = (locale: Locale) =>
  locales.find(candidate => candidate !== locale) ?? locale

function indexLanguage(locale: Locale): string {
  try {
    return (
      new Intl.DisplayNames(['en'], { type: 'language' }).of(locale) ?? locale
    )
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    return locale
  }
}
const indexNote = `This index uses ${indexLanguage(base)}.`
const entries = [base, ...locales.filter(locale => locale !== base)]
const available = new Intl.ListFormat('en', { type: 'conjunction' }).format(
  entries.map(locale => `${indexLanguage(locale)} (/${locale})`)
)
const availability = routing.hasPrefix
  ? `Content is available in ${available}. ${indexNote}`
  : indexNote

function labels(locale: Locale) {
  const options = { locale }
  const selector = m.localeSwitcher_select(
    { code: locale.toUpperCase() },
    options
  )
  return {
    locale,
    tag: tag(locale),
    name: names[locale],
    other: other(locale),
    otherTag: tag(other(locale)),
    about: m.about_title({}, options),
    title: m.home_title({}, options),
    pageTitle: m.home_seoTitle({}, options),
    selector,
    theme: m.themeToggle_select({}, options),
    dark: m.themeToggle_dark({}, options),
    missing: m.notFound_title({}, options),
    missingHeading: m.errorFallback_notFoundTitle({}, options),
    errorHeading: m.errorFallback_runtimeTitle({}, options),
    errorDescription: m.errorFallback_runtimeDescription({}, options),
    light: m.themeToggle_light({}, options),
    system: m.themeToggle_system({}, options),
    missingDescription: m.notFound_description({}, options),
    noticeDescription: m.outdatedPageNotice_description({}, options),
    fallbackDescription: m.outdatedPageNotice_fallbackDescription({}, options),
    home: m.errorFallback_home({}, options),
    dialog: m.dialog_close({}, options),
    toast: m.toast_close({}, options),
    reload: m.errorFallback_reload({}, options),
    notifications: m.toast_notifications({}, options),
    homeLink: m.siteLinks_homeLabel({}, options),
    publicError: m.configureServerErrors_message({}, options),
    noticeTitle: m.outdatedPageNotice_title({}, options),
    fallbackTitle: m.outdatedPageNotice_fallbackTitle({}, options),
    siteDescription: m.site_description({}, options),
    imageAlt: m.site_imageAlt({}, options),
    headings: [
      m.home_title({}, options),
      m.about_title({}, options),
      m.contact_title({}, options),
      m.privacy_title({}, options)
    ]
  }
}

export const testLanguages = {
  alternate,
  availability,
  base,
  indexNote,
  labels,
  locales,
  other,
  tag,
  hasPrefix: routing.hasPrefix,
  header: routing.header,
  path: routing.path,
  third
}
