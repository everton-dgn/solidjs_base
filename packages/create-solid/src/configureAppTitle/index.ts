import { readFileSync } from 'node:fs'
import path from 'node:path'

import { parse, record, string } from 'valibot'

import { editTemplate } from '../edit-template.ts'
import type { StagedContext } from '../types.ts'
import { UsageError } from '../usage-error.ts'

const original = 'SolidJS Boilerplate'
const indent = 2
const catalogs = {
  'constants/site': ['site_imageAlt'],
  'routes/(base)/(home)': ['home_title', 'home_seoTitle'],
  'routes/(base)/about': ['about_title', 'about_intro'],
  'routes/(base)/contact': ['contact_description', 'contact_intro'],
  'routes/(base)/privacy': ['privacy_intro']
}

function literal(value: string): string {
  const single = value.split("'").length
  const double = value.split('"').length
  const quote = single > double ? '"' : "'"
  const escaped = value
    .replaceAll('\\', String.raw`\\`)
    .replaceAll(quote, `\\${quote}`)
  return `${quote}${escaped}${quote}`
}

export function resolveAppTitle({
  title,
  dir
}: StagedContext['profile']): string {
  const value = title ?? path.basename(path.resolve(dir))
  if (!value.trim() || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(value)) {
    throw new UsageError(
      '--title requires nonempty text on one line without control characters'
    )
  }
  return value
}

export function configureAppTitle(context: StagedContext, title: string): void {
  const { stage, write, profile } = context
  const edit = (file: string, [pattern, value]: readonly [string, string]) => {
    const text = readFileSync(path.join(stage, file), 'utf8')
    write({
      file,
      content: editTemplate({ file, text, pattern, replacement: () => value })
    })
  }
  edit('src/constants/site/title.ts', [
    "  title: 'SolidJS Boilerplate'",
    `  get title(): string {\n    return ${literal(title)}\n  }`
  ])
  for (const [folder, keys] of Object.entries(catalogs)) {
    if (folder === 'constants/site' && profile.hasSeo === false) continue
    for (const locale of ['en', 'es', 'pt']) {
      const file = `src/${folder}/i18n/${locale}.json`
      const source = readFileSync(path.join(stage, file), 'utf8')
      const catalog = parse(record(string(), string()), JSON.parse(source))
      for (const key of keys) {
        if (key === 'contact_description' && profile.hasSeo === false) continue
        const text = catalog[key]
        if (!text) {
          throw new Error(`Missing title message: ${file} ${key}`)
        }
        catalog[key] = editTemplate({
          file,
          text,
          pattern: original,
          replacement: () => title
        })
      }
      write({ file, content: `${JSON.stringify(catalog, null, indent)}\n` })
    }
  }
  const html = title
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
  if (profile.mode === 'client') {
    // Numeric references keep whitespace and non-ASCII characters in one HTML text token.
    const encoded = html.replaceAll(
      /[^!-~]/gu,
      char => `&#${char.codePointAt(0)};`
    )
    const inlineWidth = 61
    const element =
      encoded.length <= inlineWidth
        ? `<title>${encoded}</title>`
        : `<title>\n      ${encoded}\n    </title>`
    edit('index.html', [`<title>${original}</title>`, element])
  }
  const heading = html.replaceAll(
    /[\\`*_#[\]|]/gu,
    char => `&#${char.codePointAt(0)};`
  )
  edit('README.md', ['# Solid Base application\n', `# ${heading}\n`])
}
