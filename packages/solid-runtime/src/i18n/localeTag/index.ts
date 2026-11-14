import { getLocale } from '../locale/index.ts'

type LocaleTagOverrides = Readonly<Record<string, string | undefined>>

export function localeTag(
  locale = getLocale(),
  overrides: LocaleTagOverrides = {}
): string {
  return new Intl.Locale(overrides[locale] ?? locale).toString()
}
