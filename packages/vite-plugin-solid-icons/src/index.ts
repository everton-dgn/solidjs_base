import path from 'node:path'

import type { Plugin } from 'vite-plus'

import { compileIcon } from './compileIcon/index.ts'
import {
  iconId,
  isCollectionName,
  parseIconRequest,
  readIconId
} from './iconIds/index.ts'
import { loadIconSvg } from './loadIconSvg/index.ts'
import type { IconRequest, SolidIconsOptions } from './types.ts'

type Folders = Map<string, string>
type ModuleIds = Map<string, Set<string>>
type TrackedLoad = { ids: ModuleIds; file: string; id: string }
type FileIcon = { collection: string; name: string }

const PLUGIN_NAME = 'vite-plugin-solid-icons'
const SVG_EXTENSION = '.svg'

function readFolders(collections: Record<string, string>): Folders {
  const names = Object.keys(collections)
  const invalid = names.filter(name => !isCollectionName(name))
  if (invalid.length > 0) {
    throw new Error(
      `solidIcons: the collection names ${invalid.map(name => `"${name}"`).join(', ')} must use lowercase letters, digits and single hyphens.`
    )
  }
  return new Map(Object.entries(collections))
}

function track({ ids, file, id }: TrackedLoad): void {
  const tracked = ids.get(file) ?? new Set<string>()
  tracked.add(id)
  ids.set(file, tracked)
}

// The icon of a file in the folder of a collection, also when no module
// loaded it yet: a new file answers an import that failed before.
function iconOfFile(folders: Folders, file: string): FileIcon | undefined {
  if (path.extname(file) !== SVG_EXTENSION) return undefined
  const folder = path.dirname(file)
  for (const [collection, collectionFolder] of folders) {
    if (collectionFolder === folder) {
      return { collection, name: path.basename(file, SVG_EXTENSION) }
    }
  }
  return undefined
}

export type {
  IconCustomization,
  IconCustomizer,
  SolidIconsOptions
} from './types.ts'

export function solidIcons(options: SolidIconsOptions = {}): Plugin {
  const configured = readFolders(options.collections ?? {})
  let root = ''
  let folders: Folders = new Map()
  const idsByFile: ModuleIds = new Map()

  function idsOfFile(file: string): Set<string> {
    const ids = new Set(idsByFile.get(file))
    const icon = iconOfFile(folders, file)
    if (icon) {
      ids.add(iconId({ ...icon, isRaw: false }))
      ids.add(iconId({ ...icon, isRaw: true }))
    }
    return ids
  }

  return {
    name: PLUGIN_NAME,
    enforce: 'pre',
    configResolved({ root: viteRoot }) {
      root = viteRoot
      folders = new Map(
        [...configured].map(([name, folder]) => [
          name,
          path.resolve(root, folder)
        ])
      )
    },
    configureServer(server) {
      server.watcher.add([...folders.values()])
    },
    resolveId(source) {
      let request: IconRequest | undefined
      try {
        request = parseIconRequest(source)
      } catch (error) {
        this.error(error instanceof Error ? error.message : String(error))
      }
      return request && { id: iconId(request), moduleSideEffects: false }
    },
    async load(id) {
      const request = readIconId(id)
      if (!request) return null
      const { svg, file } = await loadIconSvg({
        ...request,
        root,
        folder: folders.get(request.collection),
        customizeIcon: options.customizeIcon
      })
      if (file !== undefined) {
        this.addWatchFile(file)
        track({ ids: idsByFile, file: path.normalize(file), id })
      }
      return { code: compileIcon({ svg, isRaw: request.isRaw }), map: null }
    },
    hotUpdate(context) {
      const graph = this.environment.moduleGraph
      const ids = idsOfFile(path.normalize(context.file))
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
