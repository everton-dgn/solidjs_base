import { globalEditCounts } from './global-edit-counts.ts'

type CatalogEdit = {
  file: string
  catalog: Record<string, string>
  key: string
  value?: string
}

type TextEdit = {
  file: string
  text: string
  pattern: RegExp | string
  replacement: string | ((match: string) => string)
  expectedMatches?: number
  missing?: string
}

export function editTemplate({
  file,
  text,
  pattern,
  replacement,
  expectedMatches,
  missing
}: TextEdit): string {
  if (pattern instanceof RegExp && pattern.global) {
    const source = Object.keys(globalEditCounts).find(
      key => file === key || file.endsWith(`/${key}`)
    )
    const expected =
      expectedMatches ??
      (source ? (globalEditCounts[source]?.[String(pattern)] ?? 1) : 1)
    const count = [...text.matchAll(pattern)].length
    if (count !== expected) {
      throw new Error(
        `Template edit in ${file}: expected ${expected} matches of ${pattern}, found ${count}`
      )
    }
  }
  if (typeof pattern === 'string' && expectedMatches !== undefined) {
    const count = text.split(pattern).length - 1
    if (count !== expectedMatches) {
      throw new Error(
        `Template edit in ${file}: expected ${expectedMatches} matches of ${pattern}, found ${count}`
      )
    }
    if (typeof replacement === 'string') {
      return text.replaceAll(pattern, replacement)
    }
    return text.replaceAll(pattern, replacement)
  }
  const hasMatch =
    typeof pattern === 'string'
      ? text.includes(pattern)
      : text.search(pattern) >= 0
  if (!hasMatch) {
    throw new Error(missing ?? `Missing template edit in ${file}: ${pattern}`)
  }
  if (typeof replacement === 'string') return text.replace(pattern, replacement)
  return text.replace(pattern, replacement)
}

export function editCatalog({ file, catalog, key, value }: CatalogEdit): void {
  if (!Object.hasOwn(catalog, key)) {
    throw new Error(`Missing catalog key in ${file}: ${key}`)
  }
  if (value === undefined) Reflect.deleteProperty(catalog, key)
  else catalog[key] = value
}
