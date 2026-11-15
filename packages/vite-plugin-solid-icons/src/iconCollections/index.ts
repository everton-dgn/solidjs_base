import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { messageOf } from '../errorText/index.ts'
import { isCollectionName, isIconName } from '../iconIds/index.ts'
import {
  buildNameTable,
  type IconList,
  type NameTable
} from '../iconNames/index.ts'
import { type IconSet, loadIconSet } from '../loadIconSet/index.ts'
import { type FolderFiles, readFolderFiles } from '../readFolderFiles/index.ts'

type CollectionPlace = { root: string; folders: Folders }
type CollectionSource = CollectionPlace & {
  collection: string
  files: (collection: string) => Promise<FolderFiles>
}
type AliasInput = { aliases: NonNullable<IconSet['aliases']>; name: string }
type FolderInput = { root: string; collections: Record<string, string> }
type Manifest = Partial<Record<DependencyField, Record<string, string>>>
type DependencyField = (typeof DEPENDENCY_FIELDS)[number]
type CachedInput<Value> = { key: string; read: () => Promise<Value> }
type CachedRead<Value> = (input: CachedInput<Value>) => Promise<Value>

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

// A name the import of one icon cannot spell has no export name either,
// and stays out of the declarations, where it would be written in a comment.
function iconSetList(iconSet: IconSet): IconList {
  const aliases = iconSet.aliases ?? {}
  const icons = Object.keys(iconSet.icons).filter(name => isIconName(name))
  const plainAliases: [string, string][] = []
  for (const [name, alias] of Object.entries(aliases)) {
    if (!isIconName(name)) continue
    if (isPlainAlias(alias)) {
      plainAliases.push([name, aliasIcon({ aliases, name })])
    } else {
      icons.push(name)
    }
  }
  // WHY: fromEntries defines each name, so an alias named __proto__ stays.
  return { icons, aliases: Object.fromEntries(plainAliases) }
}

async function readIconList({
  collection,
  root,
  folders,
  files
}: CollectionSource): Promise<IconList> {
  if (folders.has(collection)) {
    const listing = await files(collection)
    return { icons: [...listing.icons], aliases: {} }
  }
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
  let manifest: unknown
  try {
    manifest = JSON.parse(text)
  } catch (error) {
    throw new Error(
      `The package.json in "${folder}" is not valid JSON, so the icon collections it installs are unknown: ${messageOf(error)}`,
      { cause: error }
    )
  }
  return isManifest(manifest) ? manifest : undefined
}

function cached<Value>(cache: Map<string, Promise<Value>>): CachedRead<Value> {
  return ({ key, read }) => {
    const known = cache.get(key)
    if (known) return known
    const value = (async () => {
      try {
        return await read()
      } catch (error) {
        // A failed read is not kept, so installing the collection or
        // creating the folder fixes it.
        cache.delete(key)
        throw error
      }
    })()
    cache.set(key, value)
    return value
  }
}

export type Folders = Map<string, string>

export type NameTables = {
  get: (collection: string) => Promise<NameTable>
  // The listing of the folder of a folder collection.
  files: (collection: string) => Promise<FolderFiles>
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

// The tables and the listings are read once per collection; a folder
// collection reads its folder again after invalidate.
export function createNameTables({
  root,
  folders
}: CollectionPlace): NameTables {
  const tables = new Map<string, Promise<NameTable>>()
  const listings = new Map<string, Promise<FolderFiles>>()
  const table = cached(tables)
  const listing = cached(listings)
  function files(collection: string): Promise<FolderFiles> {
    return listing({
      key: collection,
      read: async () => {
        const folder = folders.get(collection)
        if (folder === undefined) {
          throw new Error(`The icon collection "${collection}" has no folder.`)
        }
        return readFolderFiles({ collection, folder, root })
      }
    })
  }
  return {
    get: collection =>
      table({
        key: collection,
        read: async () =>
          buildNameTable(
            await readIconList({ collection, root, folders, files })
          )
      }),
    files,
    invalidate: collection => {
      tables.delete(collection)
      listings.delete(collection)
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
