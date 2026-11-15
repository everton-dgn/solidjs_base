import path from 'node:path'

import type { Logger, Plugin } from 'vite-plus'

import { compileIcon } from './compileIcon/index.ts'
import { messageOf } from './errorText/index.ts'
import { fileKey, iconOfFile } from './fileIcons/index.ts'
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

const PLUGIN_NAME = 'vite-plugin-solid-icons'
const SCRIPT_ID = /\.[cm]?[jt]sx?(?:\?.*)?$/u
const NODE_MODULES = /[/\\]node_modules[/\\]/u
const ICON_MODULE = /^\0?icon:/u
// The hooks that resolve and load see every module of the application;
// the filter keeps the others away from the plugin. The handlers check
// the exact form.
const ICON_SPECIFIER = /icon:/u
// The quoted name of a collection alone, as an import of the collection
// writes it; a module with only imports of one icon skips the parser.
const COLLECTION_IMPORT =
  /(?<quote>["'])icon:[a-z0-9]+(?:-[a-z0-9]+)*\k<quote>/u

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
  let runningTypes = Promise.resolve()
  let queuedTypes: Promise<void> | undefined
  let lastTypesEvent = ''
  const warnedFiles = new Set<string>()
  const idsByFile: ModuleIds = new Map()
  const importersByCollection: ModuleIds = new Map()

  function warn(message: string): void {
    logger?.warn(`[plugin ${PLUGIN_NAME}] ${message}`)
  }

  function idsOfFile(file: string): Set<string> {
    const ids = new Set(idsByFile.get(file))
    const icon = iconOfFile({ folders, file })
    if (icon) {
      ids.add(iconId({ ...icon, isRaw: false }))
      ids.add(iconId({ ...icon, isRaw: true }))
    }
    return ids
  }

  async function warnSkippedFiles(): Promise<void> {
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
    if (typesFile === undefined) return
    const content = await renderIconTypes({ root, folders, tables })
    await writeTypesFile({ file: typesFile, content })
    await warnSkippedFiles()
  }

  // One write at a time, so the last list of icons is the one on disk. The
  // updates asked while one waits share it, so a burst of new files does not
  // render the file once per file.
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
  async function reportTypes(): Promise<void> {
    try {
      await updateTypes()
    } catch (error) {
      warn(messageOf(error))
    }
  }

  return {
    name: PLUGIN_NAME,
    enforce: 'pre',
    async configResolved(config) {
      ;({ root, logger } = config)
      folders = resolveFolders({ root, collections })
      tables = createNameTables({ root, folders })
      typesFile =
        options.typesFile === false
          ? undefined
          : path.resolve(root, options.typesFile ?? DEFAULT_TYPES_FILE)
      await reportTypes()
    },
    configureServer(server) {
      server.watcher.add([...folders.values()])
    },
    resolveId: {
      filter: { id: ICON_SPECIFIER },
      // oxlint-disable-next-line eslint/max-params -- Vite calls resolveId with the source, the importer and the options.
      handler(source, _importer, resolveOptions) {
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
      }
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
    load: {
      filter: { id: ICON_SPECIFIER },
      async handler(id) {
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
          track({ ids: idsByFile, key: fileKey(file), id })
        }
        const icon = `${collection}/${name}`
        return { code: compileIcon({ svg, isRaw, icon }), map: null }
      }
    },
    async hotUpdate(context) {
      const graph = this.environment.moduleGraph
      const file = fileKey(context.file)
      const ids = idsOfFile(file)
      const icon = iconOfFile({ folders, file })
      // A new, removed or renamed SVG changes the names of its collection.
      if (icon && context.type !== 'update') {
        for (const id of importersByCollection.get(icon.collection) ?? []) {
          ids.add(id)
        }
        // Every environment receives the same event; the names and the
        // declarations change once for it.
        const event = `${context.type}:${context.timestamp}:${file}`
        if (event !== lastTypesEvent) {
          lastTypesEvent = event
          tables.invalidate(icon.collection)
          await reportTypes()
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
