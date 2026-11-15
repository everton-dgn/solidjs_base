import path from 'node:path'

import type { Logger, Plugin } from 'vite-plus'

import { compileIcon } from './compileIcon/index.ts'
import { messageOf } from './errorText/index.ts'
import { fileKey, iconsOfFile } from './fileIcons/index.ts'
import {
  createNameTables,
  type Folders,
  type NameTables,
  readFolderIdentities,
  readFolders,
  resolveFolders
} from './iconCollections/index.ts'
import {
  collectionOfImport,
  ICON_MODULE_ID,
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
  unreachedImport,
  unsupportedImport
} from './importErrors/index.ts'
import { COLLECTION_IMPORT } from './importFilter/index.ts'
import { loadIconSvg } from './loadIconSvg/index.ts'
import { type ExportRequest, rewriteImports } from './rewriteImports/index.ts'
import type { SolidIconsOptions } from './types.ts'

type ModuleIds = Map<string, Set<string>>
type TrackedId = { ids: ModuleIds; key: string; id: string }
type ModuleFile = { root: string; id: string | undefined }
type FolderLookup = {
  tables: NameTables
  collection: string
  folder: string | undefined
}
type TypesState = {
  root: string
  folders: Folders
  tables: NameTables
  typesFile: string | undefined
}
type TypesWriter = { state: () => TypesState; warn: (message: string) => void }

const PLUGIN_NAME = 'vite-plugin-solid-icons'
const SCRIPT_ID = /\.[cm]?[jt]sx?(?:\?.*)?$/u
const NODE_MODULES = /[/\\]node_modules[/\\]/u
// The hooks that resolve and load see every module of the application;
// the filter keeps the others away from the plugin. The handlers check
// the exact form.
const ICON_SPECIFIER = /icon:/u
function track({ ids, key, id }: TrackedId): void {
  const tracked = ids.get(key) ?? new Set<string>()
  tracked.add(id)
  ids.set(key, tracked)
}

async function settled(task: Promise<void>): Promise<void> {
  try {
    await task
  } catch {
    // The caller of the task reports its error.
  }
}

// The file of a module id, relative to the root, for an error.
function relativeFile({ root, id }: ModuleFile): string | undefined {
  if (id === undefined) return undefined
  const [file = id] = id.split('?', 1)
  return path.relative(root, file)
}

// Writes the declarations and warns about the files that have no import,
// also without declarations. One write at a time, so the last list of icons
// is the one on disk; the updates asked while one waits share it, so a
// burst of new files does not render the file once per file.
function createTypesWriter({ state, warn }: TypesWriter): () => Promise<void> {
  let runningTypes = Promise.resolve()
  let queuedTypes: Promise<void> | undefined
  const warnedFiles = new Set<string>()

  async function warnSkippedFiles(): Promise<void> {
    const { folders, tables } = state()
    for (const collection of folders.keys()) {
      const { skipped } = await tables.files(collection)
      for (const file of skipped) {
        const key = `${collection}/${file}`
        if (warnedFiles.has(key)) continue
        warnedFiles.add(key)
        warn(
          `The file "${file}" of the icon collection "${collection}" has no import: an icon name has letters, digits, "_" and "-", with dots only between them.`
        )
      }
    }
  }

  async function writeTypes(): Promise<void> {
    const { typesFile, ...source } = state()
    if (typesFile !== undefined) {
      const { content, warnings } = await renderIconTypes(source)
      await writeTypesFile({ file: typesFile, content })
      for (const warning of warnings) warn(warning)
    }
    await warnSkippedFiles()
  }

  function updateTypes(): Promise<void> {
    if (queuedTypes) return queuedTypes
    const previous = runningTypes
    const update = (async () => {
      await previous
      queuedTypes = undefined
      await writeTypes()
    })()
    queuedTypes = update
    runningTypes = settled(update)
    return update
  }

  // WHY: the declarations help the editor; a folder or a collection that
  // cannot be read stops only the imports that need it, and the dev server
  // keeps running.
  return async () => {
    try {
      await updateTypes()
    } catch (error) {
      warn(messageOf(error))
    }
  }
}

// The folder of a folder collection as loadIconSvg reads it, or undefined
// for an installed collection.
async function listedFolder({ tables, collection, folder }: FolderLookup) {
  return folder === undefined
    ? undefined
    : {
        path: folder,
        files: await tables.files(collection),
        refresh: () => tables.refresh(collection)
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
  let logger: Logger | undefined
  let isWatchedBuild = false
  let lastTypesEvent = ''
  const warnedIcons = new Set<string>()
  const idsByFile: ModuleIds = new Map()
  const importersByCollection: ModuleIds = new Map()

  function warn(message: string): void {
    logger?.warn(`[plugin ${PLUGIN_NAME}] ${message}`)
  }

  function idsOfFile(file: string): Set<string> {
    const ids = new Set(idsByFile.get(file))
    for (const icon of iconsOfFile({ folders, file })) {
      ids.add(iconId({ ...icon, isRaw: false }))
      ids.add(iconId({ ...icon, isRaw: true }))
    }
    return ids
  }

  const reportTypes = createTypesWriter({
    state: () => ({ root, folders, tables, typesFile }),
    warn
  })

  return {
    name: PLUGIN_NAME,
    enforce: 'pre',
    async configResolved(config) {
      ;({ root, logger } = config)
      isWatchedBuild = config.command === 'build' && Boolean(config.build.watch)
      folders = resolveFolders({ root, collections })
      // The folders that the build reads from now on.
      const identities = await readFolderIdentities(folders)
      tables = createNameTables({ root, folders, identities })
      typesFile =
        options.typesFile === false
          ? undefined
          : path.resolve(root, options.typesFile ?? DEFAULT_TYPES_FILE)
      await reportTypes()
    },
    configureServer(server) {
      server.watcher.add([...folders.values()])
    },
    // WHY: a watched build sees a new SVG only in a folder it watches, and
    // keeps the names of the collections between its builds; the dev server
    // answers the same changes in hotUpdate.
    buildStart() {
      if (!isWatchedBuild) return
      for (const folder of folders.values()) this.addWatchFile(folder)
    },
    async watchChange(id, { event }) {
      if (!isWatchedBuild || event === 'update') return
      const icons = iconsOfFile({ folders, file: fileKey(id) })
      if (icons.length === 0) return
      for (const { collection } of icons) tables.invalidate(collection)
      await reportTypes()
    },
    resolveId: {
      filter: { id: ICON_SPECIFIER },
      // oxlint-disable-next-line eslint/max-params -- Vite calls resolveId with the source, the importer and the options.
      handler(source, importer, resolveOptions) {
        const collection = collectionOfImport(source)
        if (collection !== undefined) {
          if (isDependencyScan(resolveOptions)) {
            return { id: source, external: true }
          }
          if (resolveOptions.kind === 'dynamic-import') {
            this.error(unsupportedImport({ collection, form: 'dynamic' }))
          }
          // The transform rewrites or refuses every import of a collection
          // in the files it reads, so this one comes from another file.
          this.error(
            unreachedImport({
              collection,
              importer: relativeFile({ root, id: importer })
            })
          )
        }
        let request: IconRequest | undefined
        try {
          request = parseIconRequest(source)
        } catch (error) {
          this.error(messageOf(error))
        }
        return request && { id: iconId(request), moduleSideEffects: false }
      }
    },
    transform: {
      filter: {
        id: { include: SCRIPT_ID, exclude: [NODE_MODULES, ICON_MODULE_ID] },
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
    load: {
      filter: { id: ICON_SPECIFIER },
      async handler(id) {
        const request = readIconId(id)
        if (!request) return null
        const { collection, name, isRaw } = request
        const { svg, file } = await loadIconSvg({
          ...request,
          root,
          folder: await listedFolder({
            tables,
            collection,
            folder: folders.get(collection)
          }),
          customizeIcon: options.customizeIcon
        })
        if (file !== undefined) {
          this.addWatchFile(file)
          track({ ids: idsByFile, key: fileKey(file), id })
        }
        const icon = `${collection}/${name}`
        const { code, dropped } = compileIcon({ svg, isRaw, icon })
        // The component and the raw text of an icon drop the same data.
        if (dropped.length > 0 && !warnedIcons.has(icon)) {
          warnedIcons.add(icon)
          warn(
            `Icon "${icon}": left out the editor data, which draws nothing: ${dropped.join(', ')}.`
          )
        }
        return { code, map: null }
      }
    },
    async hotUpdate(context) {
      const graph = this.environment.moduleGraph
      const file = fileKey(context.file)
      const ids = idsOfFile(file)
      // A new, removed or renamed SVG changes the names of the collections
      // whose folder holds it.
      const icons =
        context.type === 'update' ? [] : iconsOfFile({ folders, file })
      const importers = icons.flatMap(({ collection }) => [
        ...(importersByCollection.get(collection) ?? [])
      ])
      for (const id of importers) ids.add(id)
      // Every environment receives the same event; the names and the
      // declarations change once for it.
      const event = `${context.type}:${context.timestamp}:${file}`
      if (icons.length > 0 && event !== lastTypesEvent) {
        lastTypesEvent = event
        for (const { collection } of icons) tables.invalidate(collection)
        await reportTypes()
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
