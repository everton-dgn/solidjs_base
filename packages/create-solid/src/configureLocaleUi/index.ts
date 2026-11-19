import { readFileSync } from 'node:fs'
import path from 'node:path'

import { readLocaleSettings } from '../configureLocales/catalogs.ts'
import { editTemplate } from '../edit-template.ts'
import { removeFeatureFiles } from '../removeFeatureFiles/index.ts'
import type { StagedContext } from '../types.ts'

const switcher = 'src/components/molecules/LocaleSwitcher'
const indent = 2
function autonym(locale: string): string {
  const known: Readonly<Record<string, string>> = {
    en: 'English',
    pt: 'Português',
    es: 'Español'
  }
  if (known[locale]) return known[locale]
  if (Intl.DisplayNames.supportedLocalesOf(locale).length === 0) return locale
  try {
    const name = new Intl.DisplayNames([locale], {
      type: 'language',
      fallback: 'none'
    }).of(locale)
    return (
      name?.replace(/^./u, initial => initial.toLocaleUpperCase(locale)) ??
      locale
    )
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    return locale
  }
}

export function configureLocaleUi({
  stage,
  write,
  profile
}: StagedContext): void {
  const { locales, baseLocale } = readLocaleSettings(stage)
  const read = (file: string) => readFileSync(path.join(stage, file), 'utf8')
  const edit =
    (file: string) => (pattern: RegExp | string, replacement: string) =>
      write({
        file,
        content: editTemplate({ file, text: read(file), pattern, replacement })
      })
  if (locales.length === 1) {
    const topbar = edit('src/components/organisms/Topbar/index.tsx')
    topbar(/^import \{ LocaleSwitcher \}[^\n]+\n/mu, '')
    topbar(/^ *<LocaleSwitcher \/>\n/mu, '')
    const disabled = ['locale-switcher']
    if (profile.hasTheme === false) disabled.push('dropdown-menu')
    removeFeatureFiles({ stage, disabled })
  } else {
    const names = Object.fromEntries(
      locales.map(locale => [locale, autonym(locale)])
    )
    write({
      file: `${switcher}/names.json`,
      content: `${JSON.stringify(names, null, indent)}\n`
    })
    edit(`${switcher}/constants.ts`)(
      /\/\/ Autonyms[\s\S]*$/u,
      "import names from './names.json' with { type: 'json' }\n\nexport const LOCALE_NAMES: Readonly<Record<Locale, string>> = names\n"
    )
  }
  const overrides = 'src/i18n/localeTagOverrides/index.ts'
  const input = read(overrides)
  const entries = [...input.matchAll(/^ {2}(?<locale>\w+): '(?<tag>[^']+)'/gmu)]
    .filter(match => locales.includes(match.groups?.locale ?? ''))
    .map(match => match[0])
  edit(overrides)(
    /\{[\s\S]*?\} as const/u,
    entries.length > 0 ? `{\n${entries.join(',\n')}\n} as const` : '{} as const'
  )
  if (profile.mode === 'client') {
    edit('index.html')('<html lang="en">', `<html lang="${baseLocale}">`)
  }
}
