import path from 'node:path'

import type { Plugin } from 'vite-plus'

import { compileIcon } from './compileIcon/index.ts'
import { messageOf } from './errorText/index.ts'
import {
  createNameTables,
  type Folders,
  type NameTables,
  readFolders,
  resolveFolders
} from './iconCollections/index.ts'
import {
  collectionOfImport,
  iconId,
  type IconRequest,
  parseIconRequest,
  readIconId
} from './iconIds/index.ts'
import { exportedIcon } from './iconNames/index.ts'
import {
  DEFAULT_TYPES_FILE,
  renderIconTypes,
  writeTypesFile
} from './iconTypes/index.ts'
import {
  importError,
  isImportError,
  unsupportedImport
} from './importErrors/index.ts'
import { loadIconSvg } from './loadIconSvg/index.ts'
import { type ExportRequest, rewriteImports } from './rewriteImports/index.ts'
import type { SolidIconsOptions } from './types.ts'

type ModuleIds = Map<string, Set<string>>
type TrackedId = { ids: ModuleIds; key: string; id: string }
type FileIcon = { collection: string; name: string }
type FileLookup = { folders: Folders; file: string }

const PLUGIN_NAME = 'vite-plugin-solid-icons'
const SVG_EXTENSION = '.svg'
const SCRIPT_ID = /\.[cm]?[jt]sx?(?:\?.*)?$/u
const NODE_MODULES = /[/\\]node_modules[/\\]/u
const ICON_MODULE = /^\0?icon:/u
// The quoted name of a collection alone, as an import of the collection
// writes it; a module with only imports of one icon skips the parser.
const COLLECTION_IMPORT =
  /(?<quote>["'])icon:[a-z0-9]+(?:-[a-z0-9]+)*\k<quote>/u

function track({ ids, key, id }: TrackedId): void {
  const tracked = ids.get(key) ?? new Set<string>()
  tracked.add(id)
  ids.set(key, tracked)
}

// The icon of a file in the folder of a collection, also when no module
// loaded it yet: a new file answers an import that failed before.
function iconOfFile({ folders, file }: FileLookup): FileIcon | undefined {
  if (path.extname(file) !== SVG_EXTENSION) return undefined
  const folder = path.dirname(file)
  for (const [collection, collectionFolder] of folders) {
    if (collectionFolder === folder) {
      return { collection, name: path.basename(file, SVG_EXTENSION) }
    }
  }
  return undefined
}

async function settled(task: Promise<void>): Promise<void> {
  try {
    await task
  } catch {
    // The caller of the task reports its error.
  }
}

// WHY: the dependency scan of the dev server resolves the imports of the
// sources before the transform rewrites the imports by export name.
function isDependencyScan(options: object): boolean {
  return 'scan' in options && options.scan === true
}

export type {
  IconComponent,
  IconCustomization,
  IconCustomizer,
  SolidIconsOptions
} from './types.ts'
export type { IconTypesFile, IconTypesOptions } from './writeIconTypes/index.ts'
export { checkIconTypes, writeIconTypes } from './writeIconTypes/index.ts'

export function solidIcons(options: SolidIconsOptions = {}): Plugin {
  const collections = options.collections ?? {}
  // The names are checked when the configuration loads the plugin.
  readFolders(collections)
  let root = ''
  let folders: Folders = new Map()
  let tables: NameTables = createNameTables({ root, folders })
  let typesFile: string | undefined
  let runningTypes = Promise.resolve()
  const idsByFile: ModuleIds = new Map()
  const importersByCollection: ModuleIds = new Map()

  function idsOfFile(file: string): Set<string> {
    const ids = new Set(idsByFile.get(file))
    const icon = iconOfFile({ folders, file })
    if (icon) {
      ids.add(iconId({ ...icon, isRaw: false }))
      ids.add(iconId({ ...icon, isRaw: true }))
    }
    return ids
  }

  async function writeTypes(): Promise<void> {
    if (typesFile === undefined) return
    const content = await renderIconTypes({ root, folders, tables })
    await writeTypesFile({ file: typesFile, content })
  }

  // One write at a time, so the last list of icons is the one on disk.
  function updateTypes(): Promise<void> {
    const previous = runningTypes
    const update = (async () => {
      await previous
      await writeTypes()
    })()
    runningTypes = settled(update)
    return update
  }

  return {
    name: PLUGIN_NAME,
    enforce: 'pre',
    async configResolved({ root: viteRoot }) {
      root = viteRoot
      folders = resolveFolders({ root, collections })
      tables = createNameTables({ root, folders })
      typesFile =
        options.typesFile === false
          ? undefined
          : path.resolve(root, options.typesFile ?? DEFAULT_TYPES_FILE)
      await updateTypes()
    },
    configureServer(server) {
      server.watcher.add([...folders.values()])
    },
    // oxlint-disable-next-line eslint/max-params -- Vite calls resolveId with the source, the importer and the options.
    resolveId(source, _importer, resolveOptions) {
      const collection = collectionOfImport(source)
      if (collection !== undefined) {
        if (isDependencyScan(resolveOptions)) {
          return { id: source, external: true }
        }
        const form =
          resolveOptions.kind === 'dynamic-import' ? 'dynamic' : 'bare'
        this.error(unsupportedImport({ collection, form }))
      }
      let request: IconRequest | undefined
      try {
        request = parseIconRequest(source)
      } catch (error) {
        this.error(messageOf(error))
      }
      return request && { id: iconId(request), moduleSideEffects: false }
    },
    transform: {
      filter: {
        id: { include: SCRIPT_ID, exclude: [NODE_MODULES, ICON_MODULE] },
        code: COLLECTION_IMPORT
      },
      async handler(code, id) {
        const resolveIcon = async ({
          collection,
          exportName,
          position
        }: ExportRequest) => {
          // Tracked before the lookup, so a new SVG file answers an import
          // that failed.
          track({ ids: importersByCollection, key: collection, id })
          try {
            const table = await tables.get(collection)
            return exportedIcon({ table, collection, exportName })
          } catch (error) {
            throw importError({ message: messageOf(error), position })
          }
        }
        try {
          return (await rewriteImports({ code, id, resolveIcon })) ?? null
        } catch (error) {
          if (isImportError(error)) this.error(error.message, error.position)
          throw error
        }
      }
    },
    async load(id) {
      const request = readIconId(id)
      if (!request) return null
      const { collection, name, isRaw } = request
      const folder = folders.get(collection)
      const { svg, file } = await loadIconSvg({
        ...request,
        root,
        folder:
          folder === undefined
            ? undefined
            : { path: folder, files: await tables.files(collection) },
        customizeIcon: options.customizeIcon
      })
      if (file !== undefined) {
        this.addWatchFile(file)
        track({ ids: idsByFile, key: path.normalize(file), id })
      }
      const icon = `${collection}/${name}`
      return { code: compileIcon({ svg, isRaw, icon }), map: null }
    },
    async hotUpdate(context) {
      const graph = this.environment.moduleGraph
      const file = path.normalize(context.file)
      const ids = idsOfFile(file)
      const icon = iconOfFile({ folders, file })
      // A new, removed or renamed SVG changes the names of its collection.
      if (icon && context.type !== 'update') {
        for (const id of importersByCollection.get(icon.collection) ?? []) {
          ids.add(id)
        }
        tables.invalidate(icon.collection)
        try {
          await updateTypes()
        } catch (error) {
          this.warn(messageOf(error))
        }
      }
      const modules = [...ids].flatMap(id => graph.getModuleById(id) ?? [])
      if (context.type === 'update' || modules.length === 0) {
        return [...context.modules, ...modules]
      }
      // A new or removed SVG decides whether the import loads at all; a page
      // that failed on the import cannot apply a hot update, so it reloads.
      for (const module of modules) graph.invalidateModule(module)
      if (this.environment.name === 'client') {
        this.environment.hot.send({ type: 'full-reload' })
      }
      return []
    }
  }
}
