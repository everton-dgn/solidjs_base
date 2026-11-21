import type { LocaleSettings, Profile } from './types.ts'
import { ProfileProblemError } from './usage-error.ts'

type LocaleOptions = Pick<
  Profile,
  'locales' | 'baseLocale' | 'hasI18n' | 'mode'
>
type LocaleInput = { options: LocaleOptions; defaults: LocaleSettings }
type LocaleField = 'locales' | 'base-locale'

function canonicalTag(field: LocaleField, problems: ProfileProblemError[]) {
  return (value: string): string => {
    try {
      const [tag] = Intl.getCanonicalLocales(value.trim())
      if (tag) return tag
    } catch (error) {
      if (!(error instanceof RangeError)) throw error
    }
    problems.push(
      new ProfileProblemError({
        field,
        code: 'tag',
        values: { flag: `--${field}`, value }
      })
    )
    return value
  }
}

type QuestionnaireBase = { language: string; defaults: LocaleSettings }
export function questionnaireBase({
  language,
  defaults
}: QuestionnaireBase): string {
  const tag = new Intl.Locale(language).language
  return defaults.locales.includes(tag) ? tag : defaults.baseLocale
}

export function resolveLocaleOptions(
  { options, defaults }: LocaleInput,
  issues?: ProfileProblemError[]
): LocaleSettings {
  const problems: ProfileProblemError[] = []
  const { locales, hasI18n, mode } = options
  if (hasI18n === false && locales !== undefined) {
    problems.push(
      new ProfileProblemError({ field: 'locales', code: 'noTranslations' })
    )
  }
  const requested = locales?.map(canonicalTag('locales', problems))
  if (
    requested &&
    (requested.length === 0 || new Set(requested).size !== requested.length)
  ) {
    problems.push(new ProfileProblemError({ field: 'locales', code: 'list' }))
  }
  const baseLocale =
    options.baseLocale === undefined
      ? (requested?.[0] ?? defaults.baseLocale)
      : canonicalTag('base-locale', problems)(options.baseLocale)
  const selected =
    requested ??
    (mode === 'client' || hasI18n === false ? [baseLocale] : defaults.locales)
  if (problems.length === 0 && !selected.includes(baseLocale)) {
    problems.push(
      new ProfileProblemError({ field: 'base-locale', code: 'membership' })
    )
  }
  if (mode === 'client' && selected.length > 1) {
    problems.push(
      new ProfileProblemError({ field: 'locales', code: 'clientLanguages' })
    )
  }
  if (issues) issues.push(...problems)
  else if (problems[0]) throw problems[0]
  return { baseLocale, locales: selected }
}
