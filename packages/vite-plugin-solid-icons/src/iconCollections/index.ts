import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { messageOf } from '../errorText/index.ts'
import { isCollectionName, isIconName } from '../iconIds/index.ts'
import {
  buildNameTable,
  type IconList,
  type NameTable
} from '../iconNames/index.ts'
import {
  type IconSet,
  loadIconSet,
  ownIconChain
} from '../loadIconSet/index.ts'
import {
  type FolderFiles,
  type FolderIdentity,
  folderIdentity,
  readFolderFiles,
  unreadableFolder
} from '../readFolderFiles/index.ts'

type CollectionPlace = { root: string; folders: Folders }
type TablesInput = CollectionPlace & { identities?: FolderIdentities }
type CollectionSource = CollectionPlace & {
  collection: string
  files: (collection: string) => Promise<FolderFiles>
}
type AliasInput = { chain: IconSet; name: string }
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
// own. The chain is the one the load follows, which ends at an own icon even
// where an alias has the name of that icon, and its aliases have no
// prototype, so a name such as toString finds none.
function aliasIcon({ chain, name }: AliasInput): string {
  let current = name
  let alias = chain.aliases?.[current]
  while (alias && isPlainAlias(alias)) {
    current = alias.parent
    alias = chain.aliases?.[current]
  }
  return current
}

// A name the import of one icon cannot spell has no export name either,
// and stays out of the declarations, where it would be written in a comment.
// A name is declared when it loads: the chain that the load follows decides,
// so an alias that is no object or an icon without a body is left out. An
// alias whose icon no import spells loads through a module of its own.
function iconSetList(iconSet: IconSet): IconList {
  const chainOf = (name: string) =>
    isIconName(name) ? ownIconChain({ iconSet, name }) : undefined
  const icons = Object.keys(iconSet.icons).filter(
    name => chainOf(name) !== undefined
  )
  const plainAliases: [string, string][] = []
  for (const name of Object.keys(iconSet.aliases ?? {})) {
    // The load reads an icon before an alias of the same name.
    const chain = Object.hasOwn(iconSet.icons, name) ? undefined : chainOf(name)
    if (chain === undefined) continue
    const icon = aliasIcon({ chain, name })
    if (icon !== name && isIconName(icon)) {
      plainAliases.push([name, icon])
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
    return { icons: [...listing.icons.keys()], aliases: {} }
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

// The folder of each folder collection as the plugin read it first.
export type FolderIdentities = Map<string, FolderIdentity>

export type NameTables = {
  get: (collection: string) => Promise<NameTable>
  // The listing of the folder of a folder collection.
  files: (collection: string) => Promise<FolderFiles>
  // Lists the folder again, for a file that changed since the listing.
  refresh: (collection: string) => Promise<FolderFiles>
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

// The folders that can be read now; the others are read first when they
// are listed, so a folder created later still works.
export async function readFolderIdentities(
  folders: Folders
): Promise<FolderIdentities> {
  const identities: FolderIdentities = new Map()
  for (const [collection, folder] of folders) {
    try {
      identities.set(collection, await folderIdentity(folder))
    } catch {
      // The listing reports the folder that cannot be read.
    }
  }
  return identities
}

// The tables and the listings are read once per collection; a folder
// collection reads its folder again after invalidate. Every listing reads
// the folder of the identity, the one that the plugin read first.
export function createNameTables({
  root,
  folders,
  identities = new Map()
}: TablesInput): NameTables {
  const tables = new Map<string, Promise<NameTable>>()
  const listings = new Map<string, Promise<FolderFiles>>()
  const table = cached(tables)
  const listing = cached(listings)
  async function readListing(collection: string): Promise<FolderFiles> {
    const folder = folders.get(collection)
    if (folder === undefined) {
      throw new Error(`The icon collection "${collection}" has no folder.`)
    }
    let identity = identities.get(collection)
    if (identity === undefined) {
      try {
        identity = await folderIdentity(folder)
      } catch (error) {
        throw unreadableFolder({ collection, folder, root, error })
      }
      identities.set(collection, identity)
    }
    return readFolderFiles({ collection, folder, root, identity })
  }
  function files(collection: string): Promise<FolderFiles> {
    return listing({ key: collection, read: () => readListing(collection) })
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
    refresh: collection => {
      listings.delete(collection)
      return files(collection)
    },
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
