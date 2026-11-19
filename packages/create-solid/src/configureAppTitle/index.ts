import { readFileSync } from 'node:fs'
import path from 'node:path'

import { parse, record, string } from 'valibot'

import { readLocaleSettings } from '../configureLocales/catalogs.ts'
import { editTemplate } from '../edit-template.ts'
import { escapeMessageText } from '../escape-message-text.ts'
import type { StagedContext } from '../types.ts'
import { UsageError } from '../usage-error.ts'

const original = 'SolidJS Boilerplate'
const indent = 2
const catalogs = {
  'routes/(base)/(home)': ['home_title', 'home_seoTitle'],
  'routes/(base)/about': ['about_title', 'about_intro'],
  'routes/(base)/contact': ['contact_description']
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

type TitleOptions = { context: StagedContext; title: string }
type TitleEdit = { file: string; change: readonly [string, string] }

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
  return value.trim().replaceAll(/ +/gu, ' ')
}

export function configureAppTitle({ context, title }: TitleOptions): void {
  const { stage, write, profile } = context
  const edit = ({ file, change: [pattern, value] }: TitleEdit) => {
    const text = readFileSync(path.join(stage, file), 'utf8')
    write({
      file,
      content: editTemplate({ file, text, pattern, replacement: () => value })
    })
  }
  edit({
    file: 'src/constants/site/title.ts',
    change: [
      "  title: 'SolidJS Boilerplate'",
      `  get title(): string {\n    return ${literal(title)}\n  }`
    ]
  })
  for (const [folder, keys] of Object.entries(catalogs)) {
    for (const locale of readLocaleSettings(stage).locales) {
      const file = `src/${folder}/i18n/${locale}.json`
      const source = readFileSync(path.join(stage, file), 'utf8')
      const catalog = parse(record(string(), string()), JSON.parse(source))
      for (const key of keys) {
        if (key === 'contact_description' && profile.hasSeo === false) continue
        const text = catalog[key]
        if (!text) {
          throw new Error(`Missing title message: ${file} ${key}`)
        }
        const pattern =
          key === 'home_title' || key === 'home_seoTitle' ? text : original
        catalog[key] = editTemplate({
          file,
          text,
          pattern,
          replacement: () => escapeMessageText(title)
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
    const inlineWidth = 61
    const contentWidth = 74
    const lines: string[] = []
    let line = ''
    for (const word of html.split(' ')) {
      if (line && line.length + word.length + 1 > contentWidth) {
        lines.push(line)
        line = ''
      }
      line += line ? ` ${word}` : word
    }
    lines.push(line)
    const element =
      html.length <= inlineWidth
        ? `<title>${html}</title>`
        : `<title>\n      ${lines.join('\n      ')}\n    </title>`
    edit({
      file: 'index.html',
      change: [`<title>${original}</title>`, element]
    })
  }
  const heading = html.replaceAll(
    /[\\`*_~#[\]|]/gu,
    char => `&#${char.codePointAt(0)};`
  )
  edit({
    file: 'README.md',
    change: ['# Solid Base application\n', `# ${heading}\n`]
  })
}
