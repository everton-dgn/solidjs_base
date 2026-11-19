import { readFileSync } from 'node:fs'
import path from 'node:path'

import { parse, record, string } from 'valibot'

import {
  catalogFolders,
  readLocaleSettings
} from '../src/configureLocales/catalogs.ts'
import { testLabels } from '../src/configureLocales/test-labels.ts'

type Label = { locale: string; field: string }
function addNoticeSentences(
  cases: Map<string, Label>,
  entry: Label & { value: string }
): void {
  const { value, locale, field } = entry
  if (field !== 'noticeDescription' && field !== 'fallbackDescription') return
  for (const sentence of value.match(/[^.!?]+[.!?]/gu) ?? []) {
    const part = sentence.trim()
    if (!cases.has(part)) cases.set(part, { locale, field })
  }
}
let cached: Map<string, Label> | undefined
export function catalogTestLabels(): ReadonlyMap<string, Label> {
  if (cached) return cached
  const template = path.resolve(import.meta.dirname, '../template')
  const cases = new Map<string, Label>()
  const { locales } = readLocaleSettings(template)
  for (const locale of locales) {
    const name =
      new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale
    cases.set(name.charAt(0).toLocaleUpperCase(locale) + name.slice(1), {
      locale,
      field: 'name'
    })
    for (const folder of catalogFolders(template)) {
      const source = readFileSync(path.join(folder, `${locale}.json`), 'utf8')
      const catalog = parse(record(string(), string()), JSON.parse(source))
      for (const [key, value] of Object.entries(catalog)) {
        const field = testLabels[key]
        if (!field) continue
        addNoticeSentences(cases, { value, field, locale })
        const label =
          field === 'selector' ? value.replace(/^\{code\},\s*/u, '') : value
        cases.set(label.charAt(0).toLocaleUpperCase(locale) + label.slice(1), {
          locale,
          field
        })
      }
    }
  }
  cached = cases
  return cases
}

export function expectedTestLabel(
  value: string,
  roles: Record<string, string>
): string | undefined {
  const cookie = /^locale=(?<locale>pt|es|en)(?<attributes>;.*)?$/u.exec(
    value
  )?.groups
  if (cookie?.locale) {
    return `\`locale=\${testLanguages.${roles[cookie.locale]}}${cookie.attributes ?? ''}\``
  }
  const fragment =
    /^(?<position>first|second):(?<locale>en|pt|es):resolved$/u.exec(
      value
    )?.groups
  if (fragment?.locale) {
    return `\`${fragment.position}:\${testLanguages.${roles[fragment.locale]}}:resolved\``
  }
  const locale = roles[value]
  if (locale) return `testLanguages.${locale}`
  const attribute = /^lang="(?<language>pt|en|es)-[A-Z]{2}"$/u.exec(value)
    ?.groups?.language
  if (attribute) {
    return `\`lang="\${testLanguages.tag(testLanguages.${roles[attribute]})}"\``
  }
  const tag = /^(?<language>pt|es|en)-[A-Z]{2}$/u.exec(value)?.groups?.language
  if (tag) return `testLanguages.tag(testLanguages.${roles[tag]})`
  const heading = value.startsWith('# ')
  const item = catalogTestLabels().get(
    heading ? value.slice('# '.length) : value
  )
  if (item) {
    const label = `testLanguages.labels(testLanguages.${roles[item.locale]}).${item.field}`
    return heading ? `\`# \${${label}}\`` : label
  }
  return undefined
}
