import { glob, readFile } from 'node:fs/promises'
import path from 'node:path'

import { ICON_TYPES_FILE } from '../../icons/constants.ts'
import { readDependencies } from '../readDependencies/index.ts'

type ModuleSource = { file: string; source: string }

type FoundImports = { hasIcons: boolean; hasPluginTypes: boolean }

// Knip reads icon:<collection>/<name> as an import of a package named icon.
const ICON_IMPORT = 'icon'
// Knip reads a string with a regular expression character as a RegExp.
const ICON_COLLECTION = '^@iconify-json/'
const COLLECTION_SCOPE = '@iconify-json/'
const PLUGIN = '@evertondgn/vite-plugin-solid-icons'
const PLUGIN_TYPES = `${PLUGIN}/types`
const SOURCES = '{src,tooling}/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'
// WHY: the declarations that the plugin writes have the text of PLUGIN_TYPES
// in each module they declare and grow with the installed collections, so the
// text would send the largest file of src/ to the parser, which lists no import
// inside a declared module. The preset ignores their unlisted import by file.
const ICON_TYPES_PATH = path.normalize(ICON_TYPES_FILE)
const ICON_PREFIX = 'icon:'
// A string or a template that starts with icon:, as the path of an icon import
// does. The parser tells the imports from the rest; a pattern that also read the
// text before the path would miss an import with a comment there.
const ICON_SPECIFIER = /["'`]icon:/u
// The argument of a dynamic import that Knip reads, as the source spells it: a
// string, or a template without an expression. Knip reads no path that the
// code builds, such as 'icon:brand/' + name, so an ignore for it would be a
// configuration hint.
const ICON_STRING =
  /^(?:(?<quote>["'])icon:[^"']*\k<quote>|`icon:(?:[^$`]|\$(?!\{))*`)$/u

// WHY: Knip reads the imports with a parser, so an icon: in a comment or a
// string has no import that uses the ignore, and the hint of the unused ignore
// fails the run. The parser of vite-plus reads the files that the text points
// at, and is loaded only for them.
async function readImports({
  file,
  source
}: ModuleSource): Promise<FoundImports> {
  const { parse } = await import('vite-plus')
  const { module } = await parse(file, source)
  const requests = [
    ...module.staticImports.map(({ moduleRequest }) => moduleRequest.value),
    ...module.staticExports.flatMap(({ entries }) =>
      entries.flatMap(({ moduleRequest }) =>
        moduleRequest ? [moduleRequest.value] : []
      )
    )
  ]
  return {
    hasIcons:
      requests.some(request => request.startsWith(ICON_PREFIX)) ||
      module.dynamicImports.some(({ moduleRequest }) =>
        ICON_STRING.test(source.slice(moduleRequest.start, moduleRequest.end))
      ),
    hasPluginTypes: requests.includes(PLUGIN_TYPES)
  }
}

// The reads stop once both imports are found.
async function findImports(root: string): Promise<FoundImports> {
  const found: FoundImports = { hasIcons: false, hasPluginTypes: false }
  for await (const file of glob(SOURCES, { cwd: root })) {
    if (file === ICON_TYPES_PATH) continue
    const source = await readFile(path.join(root, file), 'utf8')
    const isIconCandidate = !found.hasIcons && ICON_SPECIFIER.test(source)
    const isTypesCandidate =
      !found.hasPluginTypes && source.includes(PLUGIN_TYPES)
    if (isIconCandidate || isTypesCandidate) {
      const imports = await readImports({ file, source })
      found.hasIcons ||= imports.hasIcons
      found.hasPluginTypes ||= imports.hasPluginTypes
      if (found.hasIcons && found.hasPluginTypes) return found
    }
  }
  return found
}

// The icons plugin of the preset resolves the icon: imports and loads each
// Iconify collection by its name, so Knip sees neither. The types entry of the
// plugin comes from the icon-modules declarations of this package, so an
// application imports it without the plugin, which Knip reports as unlisted.
// WHY: an ignore that matches nothing is a configuration hint, which fails the
// run, so each one is added only when the application has what it ignores; an
// application that declares the plugin has no unlisted import to ignore.
export async function iconIgnores(root: string): Promise<string[]> {
  const [imports, dependencies] = await Promise.all([
    findImports(root),
    readDependencies(root)
  ])
  const hasCollection = dependencies.some(name =>
    name.startsWith(COLLECTION_SCOPE)
  )
  const hasUnlistedTypes =
    imports.hasPluginTypes && !dependencies.includes(PLUGIN)
  return [
    ...(imports.hasIcons ? [ICON_IMPORT] : []),
    ...(hasCollection ? [ICON_COLLECTION] : []),
    ...(hasUnlistedTypes ? [PLUGIN] : [])
  ]
}
