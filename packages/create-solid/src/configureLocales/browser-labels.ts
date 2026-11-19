import type { StagedContext } from '../types.ts'
import { readLocaleSettings } from './catalogs.ts'

export function browserLocaleLabels({ stage, profile }: StagedContext): string {
  const hasSwitcher = readLocaleSettings(stage).locales.length > 1
  const selector = hasSwitcher
    ? 'm.localeSwitcher_select({ code: locale.toUpperCase() }, options)'
    : 'locale'
  const theme =
    profile.hasTheme === false
      ? 'selector'
      : 'm.themeToggle_select({}, options)'
  const dark =
    profile.hasTheme === false ? 'locale' : 'm.themeToggle_dark({}, options)'
  const namesImport = hasSwitcher
    ? "import names from '@/components/molecules/LocaleSwitcher/names.json' with { type: 'json' }"
    : ''
  return `import { m } from '@paraglide/messages.js'
import { baseLocale, locales, type Locale } from '@paraglide/runtime.js'
import { SITE } from '@/constants/site/title.ts'
import { LOCALE_TAG_OVERRIDES } from '@/i18n/localeTagOverrides/index.ts'
${namesImport}

const base = baseLocale
const alternate = ${hasSwitcher ? 'locales.find(locale => locale !== base) ?? base' : 'base'}
const third = ${hasSwitcher ? 'locales.find(locale => locale !== base && locale !== alternate) ?? alternate' : 'base'}
const tags: Readonly<Record<string,string>> = LOCALE_TAG_OVERRIDES
const tag = (locale: Locale) => new Intl.Locale(tags[locale] ?? locale).toString()
const other = (locale: Locale) => ${hasSwitcher ? 'locales.find(candidate => candidate !== locale) ?? locale' : 'locale'}

function indexLanguage(locale: Locale): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(locale) ?? locale
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    return locale
  }
}
const indexNote = \`This index uses \${indexLanguage(base)}.\`
const entries = ${hasSwitcher ? '[base, ...locales.filter(locale => locale !== base)]' : '[base]'}
const available = new Intl.ListFormat('en', { type: 'conjunction' }).format(entries.map(locale =>
  \`\${indexLanguage(locale)} (/\${locale})\`))
const availability = \`Content is available in \${available}. \${indexNote}\`

function labels(locale: Locale) {
  const options = { locale }
  const selector = ${selector}
  return {
    locale, tag: tag(locale), name: ${hasSwitcher ? 'names[locale]' : 'locale'},
    other: other(locale), otherTag: tag(other(locale)),
    about: m.about_title({}, options),
    title: SITE.title, selector, theme: ${theme}, dark: ${dark},
    missing: m.notFound_title({}, options), missingHeading: m.errorFallback_notFoundTitle({}, options),
    errorHeading: m.errorFallback_runtimeTitle({}, options), errorDescription: m.errorFallback_runtimeDescription({}, options),
    light: ${profile.hasTheme === false ? 'locale' : 'm.themeToggle_light({}, options)'},
    system: ${profile.hasTheme === false ? 'locale' : 'm.themeToggle_system({}, options)'},
    missingDescription: ${profile.hasSeo === false ? "''" : 'm.notFound_description({}, options)'},
    noticeDescription: m.outdatedPageNotice_description({}, options),
    fallbackDescription: m.outdatedPageNotice_fallbackDescription({}, options),
    home: m.errorFallback_home({}, options), dialog: m.dialog_close({}, options), toast: m.toast_close({}, options),
    reload: m.errorFallback_reload({}, options), notifications: m.toast_notifications({}, options),
    homeLink: m.siteLinks_homeLabel({}, options), publicError: m.configureServerErrors_message({}, options),
    noticeTitle: m.outdatedPageNotice_title({}, options), fallbackTitle: m.outdatedPageNotice_fallbackTitle({}, options),
    siteDescription: ${profile.hasSeo === false ? "''" : 'm.site_description({}, options)'}, imageAlt: ${profile.hasSeo === false ? "''" : 'm.site_imageAlt({}, options)'},
    headings: [SITE.title, m.about_title({}, options), m.contact_title({}, options), m.privacy_title({}, options)]
  }
}

export const testLanguages = { alternate, availability, base, indexNote, labels, locales, other, tag, third }
`
}
