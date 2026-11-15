import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { isCollectionName, isIconName } from '../iconIds/index.ts'
import {
  buildNameTable,
  type IconList,
  type NameTable
} from '../iconNames/index.ts'
import { type IconSet, loadIconSet } from '../loadIconSet/index.ts'

type CollectionPlace = { root: string; folders: Folders }
type CollectionSource = CollectionPlace & { collection: string }
type FolderSource = { collection: string; folder: string; root: string }
type AliasInput = { aliases: NonNullable<IconSet['aliases']>; name: string }
type FolderInput = { root: string; collections: Record<string, string> }
type Manifest = Partial<Record<DependencyField, Record<string, string>>>
type DependencyField = (typeof DEPENDENCY_FIELDS)[number]

const SVG_EXTENSION = '.svg'
const COLLECTION_SCOPE = '@iconify-json/'
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies'
] as const

function isPlainAlias(alias: object): boolean {
  return Object.keys(alias).every(key => key === 'parent')
}

// An alias without transformations draws the SVG of its parent, so both
// names load the same icon; an alias that flips or rotates is an icon of its
// own.
function aliasIcon({ aliases, name }: AliasInput): string {
  const seen = new Set<string>()
  let current = name
  let alias = aliases[current]
  while (alias && isPlainAlias(alias) && !seen.has(current)) {
    seen.add(current)
    current = alias.parent
    alias = aliases[current]
  }
  return current
}

function iconSetList(iconSet: IconSet): IconList {
  const aliases = iconSet.aliases ?? {}
  const icons = Object.keys(iconSet.icons)
  const plainAliases: Record<string, string> = {}
  for (const [name, alias] of Object.entries(aliases)) {
    if (isPlainAlias(alias)) plainAliases[name] = aliasIcon({ aliases, name })
    else icons.push(name)
  }
  return { icons, aliases: plainAliases }
}

async function readFolderList({
  collection,
  folder,
  root
}: FolderSource): Promise<IconList> {
  let files: string[]
  try {
    files = await readdir(folder)
  } catch (error) {
    const relative = path.relative(root, folder) || '.'
    throw new Error(
      `The folder "${relative}" of the icon collection "${collection}" cannot be read.`,
      { cause: error }
    )
  }
  const icons = files
    .filter(file => path.extname(file) === SVG_EXTENSION)
    .map(file => path.basename(file, SVG_EXTENSION))
    // A file the import of one icon cannot spell has no export name either.
    .filter(name => isIconName(name))
  return { icons, aliases: {} }
}

async function readIconList({
  collection,
  root,
  folders
}: CollectionSource): Promise<IconList> {
  const folder = folders.get(collection)
  if (folder !== undefined) return readFolderList({ collection, folder, root })
  return iconSetList(await loadIconSet({ collection, root }))
}

function isManifest(value: unknown): value is Manifest {
  return typeof value === 'object' && value !== null
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function findManifest(folder: string): Promise<Manifest | undefined> {
  let text: string
  try {
    text = await readFile(path.join(folder, 'package.json'), 'utf8')
  } catch (error) {
    if (!isMissingFile(error)) throw error
    const parent = path.dirname(folder)
    return parent === folder ? undefined : findManifest(parent)
  }
  const manifest: unknown = JSON.parse(text)
  return isManifest(manifest) ? manifest : undefined
}

export type Folders = Map<string, string>

export type NameTables = {
  get: (collection: string) => Promise<NameTable>
  invalidate: (collection: string) => void
}

export function readFolders(collections: Record<string, string>): Folders {
  const names = Object.keys(collections)
  const invalid = names.filter(name => !isCollectionName(name))
  if (invalid.length > 0) {
    throw new Error(
      `solidIcons: the collection names ${invalid.map(name => `"${name}"`).join(', ')} must use lowercase letters, digits and single hyphens.`
    )
  }
  return new Map(Object.entries(collections))
}

export function resolveFolders({ root, collections }: FolderInput): Folders {
  return new Map(
    [...readFolders(collections)].map(([name, folder]) => [
      name,
      path.resolve(root, folder)
    ])
  )
}

// The tables are read once per collection; a folder collection reads its
// files again after invalidate.
export function createNameTables({
  root,
  folders
}: CollectionPlace): NameTables {
  const tables = new Map<string, Promise<NameTable>>()
  async function readTable(collection: string): Promise<NameTable> {
    try {
      return buildNameTable(await readIconList({ collection, root, folders }))
    } catch (error) {
      // A failed read is not kept, so installing the collection fixes it.
      tables.delete(collection)
      throw error
    }
  }
  function get(collection: string): Promise<NameTable> {
    const table = tables.get(collection) ?? readTable(collection)
    tables.set(collection, table)
    return table
  }
  return {
    get,
    invalidate: collection => {
      tables.delete(collection)
    }
  }
}

// The @iconify-json collections in the package.json closest to the root.
export async function declaredCollections(root: string): Promise<string[]> {
  const manifest = await findManifest(root)
  const names = DEPENDENCY_FIELDS.flatMap(field =>
    Object.keys(manifest?.[field] ?? {})
  )
  return [
    ...new Set(
      names
        .filter(name => name.startsWith(COLLECTION_SCOPE))
        .map(name => name.slice(COLLECTION_SCOPE.length))
    )
  ]
}
