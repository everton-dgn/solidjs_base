type ErrorInput = { message: string; position: number }
type UnsupportedInput = { collection: string; form: UnsupportedForm }
type UnreachedInput = { collection: string; importer: string | undefined }

function usage(collection: string): string {
  return `Import the icons by name, as in import { <Name> } from 'icon:${collection}', or each icon by its path, as in import <Name> from 'icon:${collection}/<name>'.`
}

const UNSUPPORTED: Record<UnsupportedForm, (collection: string) => string> = {
  namespace: collection =>
    `A namespace import of 'icon:${collection}' is not supported. ${usage(collection)}`,
  default: collection =>
    `A default import of 'icon:${collection}' is not supported. ${usage(collection)}`,
  bare: collection =>
    `import 'icon:${collection}' is not supported: a collection of icons is not a module. ${usage(collection)}`,
  'export-all': collection =>
    `export * from 'icon:${collection}' is not supported. ${usage(collection)}`,
  dynamic: collection =>
    `import('icon:${collection}') is not supported: load one icon by its path, as in import('icon:${collection}/<name>').`
}

// An error in an import, with the offset of the name that caused it, for
// the code frame of Vite.
export type ImportError = Error & { position: number }

export type UnsupportedForm =
  | 'namespace'
  | 'default'
  | 'bare'
  | 'export-all'
  | 'dynamic'

export function importError({ message, position }: ErrorInput): ImportError {
  return Object.assign(new Error(message), { position })
}

export function isImportError(error: unknown): error is ImportError {
  return (
    error instanceof Error &&
    'position' in error &&
    typeof error.position === 'number'
  )
}

export function unsupportedImport({
  collection,
  form
}: UnsupportedInput): string {
  return UNSUPPORTED[form](collection)
}

// An import of a collection in a file that the transform does not read:
// another type of file, a file in node_modules or a file that does not parse.
export function unreachedImport({
  collection,
  importer
}: UnreachedInput): string {
  const place = importer === undefined ? '' : ` in ${importer}`
  return `import 'icon:${collection}'${place} is not supported: the imports by name work in the .js, .ts, .jsx and .tsx files of the application, outside node_modules, that parse. Import each icon by its path there, as in import <Name> from 'icon:${collection}/<name>'.`
}
