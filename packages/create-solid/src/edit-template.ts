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
  missing?: string
}

type Replacement = readonly [
  pattern: string | RegExp,
  replacement: string,
  shouldApply?: boolean
]
type ApplyEdits = (text: string, edits: readonly Replacement[]) => string
export type EditFile = (
  file: string,
  transform: (text: string, apply: ApplyEdits) => string
) => void

export function editTemplate({
  file,
  text,
  pattern,
  replacement,
  missing
}: TextEdit): string {
  const matches =
    typeof pattern === 'string'
      ? text.includes(pattern)
      : text.search(pattern) >= 0
  if (!matches) {
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
