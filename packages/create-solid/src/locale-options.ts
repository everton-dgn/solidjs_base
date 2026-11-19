import type { LocaleSettings, Profile } from './types.ts'
import { UsageError } from './usage-error.ts'

type LocaleOptions = Pick<
  Profile,
  'locales' | 'baseLocale' | 'hasI18n' | 'mode'
>
type LocaleInput = { options: LocaleOptions; defaults: LocaleSettings }

function canonicalTag(flag: string): (value: string) => string {
  return value => {
    try {
      const [tag] = Intl.getCanonicalLocales(value.trim())
      if (tag) return tag
    } catch (error) {
      if (!(error instanceof RangeError)) throw error
    }
    throw new UsageError(
      `${flag} requires a valid BCP 47 language tag: ${value}`
    )
  }
}

export function resolveLocaleOptions({
  options,
  defaults
}: LocaleInput): LocaleSettings {
  const { locales, hasI18n, mode } = options
  if (hasI18n === false && locales !== undefined) {
    throw new UsageError('--locales cannot be combined with --no-i18n')
  }
  const requested = locales?.map(canonicalTag('--locales'))
  if (
    requested?.length === 0 ||
    new Set(requested).size !== (requested?.length ?? 0)
  ) {
    throw new UsageError(
      '--locales requires a nonempty list of distinct language tags'
    )
  }
  const baseLocale =
    options.baseLocale === undefined
      ? (requested?.[0] ?? defaults.baseLocale)
      : canonicalTag('--base-locale')(options.baseLocale)
  const selected =
    requested ??
    (mode === 'client' || hasI18n === false ? [baseLocale] : defaults.locales)
  if (!selected.includes(baseLocale)) {
    throw new UsageError('--base-locale must be in --locales')
  }
  if (mode === 'client' && selected.length > 1) {
    throw new UsageError(
      '--locales accepts one language in client mode. Use --mode static for multiple languages.'
    )
  }
  return { baseLocale, locales: selected }
}
