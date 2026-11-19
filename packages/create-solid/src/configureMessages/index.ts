import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { parse, record, string } from 'valibot'

import {
  catalogFolders,
  readLocaleSettings
} from '../configureLocales/catalogs.ts'
import type { StagedContext } from '../types.ts'

type MessageSource = { name: string; pattern: string }
const lineWidth = 80
const special = /\\(?<escaped>[\\{}])|\{(?<parameter>[A-Za-z_]\w*)\}/gu
const identifier = /^[A-Za-z_]\w*$/u
const literal = (value: string) =>
  value
    .replaceAll('\\', String.raw`\\`)
    .replaceAll('`', '\\`')
    .replaceAll('${', '\\${')
function messageFunction({ name, pattern }: MessageSource): string {
  if (!identifier.test(name)) {
    throw new Error(`Unsupported message key: ${name}`)
  }
  const params = new Set<string>()
  let expression = ''
  let chunk = ''
  let position = 0
  for (const match of pattern.matchAll(special)) {
    chunk += pattern.slice(position, match.index)
    position = match.index + match[0].length
    const parameter = match.groups?.parameter
    if (parameter) {
      expression += literal(chunk)
      chunk = ''
      params.add(parameter)
      expression += `\${params.${parameter}}`
    } else chunk += match.groups?.escaped ?? ''
  }
  expression += literal(chunk + pattern.slice(position))
  if (params.size === 0) {
    const value = pattern.replaceAll(special, '$<escaped>')
    const quoted = JSON.stringify(value)
    const single = value.split("'").length
    const double = value.split('"').length
    const text =
      single > double
        ? quoted
        : `'${quoted
            .slice(1, -1)
            .replaceAll(String.raw`\"`, '"')
            .replaceAll("'", String.raw`\'`)}'`
    return `function ${name}(): string {\n  return ${text}\n}`
  }
  const fields = [...params].map(key => `${key}: string`)
  const signature =
    fields.length > 1
      ? `params: {\n  ${fields.join('\n  ')}\n}`
      : `params: { ${fields[0]} }`
  return `function ${name}(${signature}): string {\n  return \`${expression}\`\n}`
}

export function configureMessages({
  stage,
  write
}: Pick<StagedContext, 'stage' | 'write'>): void {
  const { baseLocale } = readLocaleSettings(stage)
  const messages = new Map<string, string>()
  for (const folder of catalogFolders(stage)) {
    const source = readFileSync(path.join(folder, `${baseLocale}.json`), 'utf8')
    const catalog = parse(record(string(), string()), JSON.parse(source))
    for (const [name, pattern] of Object.entries(catalog)) {
      if (messages.has(name)) throw new Error(`Duplicate message key: ${name}`)
      messages.set(name, pattern)
    }
  }
  const methods = [...messages].map(([name, pattern]) =>
    messageFunction({ name, pattern })
  )
  const file = 'src/constants/messages/index.ts'
  mkdirSync(path.dirname(path.join(stage, file)), { recursive: true })
  const names = [...messages.keys()]
  const exported =
    names.join(', ').length + 'export const m = {  }'.length > lineWidth
      ? `{\n  ${names.join(',\n  ')}\n}`
      : `{ ${names.join(', ')} }`
  write({
    file,
    content: `import type { getLocale } from '@evertondgn/solid-runtime/i18n/locale'\n\n${methods.join('\n\n')}\n\nexport type Locale = ReturnType<typeof getLocale>\n\nexport const m = ${exported}\n`
  })
}
