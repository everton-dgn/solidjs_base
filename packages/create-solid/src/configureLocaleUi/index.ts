import { readFileSync } from 'node:fs'
import path from 'node:path'

import { readLocaleSettings } from '../configureLocales/catalogs.ts'
import { editTemplate } from '../edit-template.ts'
import { removeFeatureFiles } from '../removeFeatureFiles/index.ts'
import type { StagedContext } from '../types.ts'

const switcher = 'src/components/molecules/LocaleSwitcher'
const indent = 2
function autonym(locale: string): string {
  if (Intl.DisplayNames.supportedLocalesOf(locale).length === 0) return locale
  return (
    new Intl.DisplayNames([locale], { type: 'language', fallback: 'none' }).of(
      locale
    ) ?? locale
  )
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
      "import names from './names.json'\n\nexport const LOCALE_NAMES: Readonly<Record<Locale, string>> = names\n"
    )
    const test = edit(`${switcher}/__tests__/LocaleSwitcher.browser.test.tsx`)
    test(
      'import { createRouter',
      "import { m } from '@paraglide/messages.js'\nimport { baseLocale } from '@paraglide/runtime.js'\nimport { createRouter"
    )
    test(
      'import { LocaleSwitcher }',
      "import { LOCALE_NAMES } from '../constants.ts'\nimport { LocaleSwitcher }"
    )
    test("memoryHistory('/en')", `memoryHistory(\`/\${baseLocale}\`)`)
    test(
      "    const trigger = page.getByRole('button', { name: /select language/u })",
      "    const code = baseLocale.toUpperCase()\n    const name = m.localeSwitcher_select({ code }, { locale: baseLocale })\n    const trigger = page.getByRole('button', { name })"
    )
    test("toHaveTextContent('EN')", 'toHaveTextContent(code)')
    test(
      "toHaveAccessibleName('EN, select language')",
      'toHaveAccessibleName(name)'
    )
    test(
      '    await trigger.click()',
      '    await trigger.click()\n    const itemName = LOCALE_NAMES[baseLocale]'
    )
    test("name: 'English'", 'name: itemName')
  }
  const overrides = 'src/i18n/localeTagOverrides/index.ts'
  const input = read(overrides)
  const keep = profile.locales === undefined && profile.baseLocale === undefined
  const entries = [...input.matchAll(/^ {2}(?<locale>\w+): '(?<tag>[^']+)'/gmu)]
    .filter(match => keep && locales.includes(match.groups?.locale ?? ''))
    .map(match => match[0])
  if (entries.length > 0 || !keep || locales.length === 1) {
    edit(overrides)(
      /\{[\s\S]*?\} as const/u,
      entries.length > 0
        ? `{\n${entries.join(',\n')}\n} as const`
        : '{} as const'
    )
  }
  const typeTest = edit('src/i18n/__tests__/i18n.test-d.ts')
  typeTest('import type { Locale }', 'import { baseLocale, type Locale }')
  typeTest("const locale: Locale = 'es'", 'const locale: Locale = baseLocale')
  typeTest("locale: 'fr'", "locale: 'invalid_locale'")
  if (profile.mode === 'client') {
    edit('index.html')('<html lang="en">', `<html lang="${baseLocale}">`)
  }
}
