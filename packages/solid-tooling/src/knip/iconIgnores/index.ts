import { glob, readFile } from 'node:fs/promises'
import path from 'node:path'

type ModuleSource = { file: string; source: string }

// Knip reads icon:<collection>/<name> as an import of a package named icon.
const ICON_IMPORT = 'icon'
// Knip reads a string with a regular expression character as a RegExp.
const ICON_COLLECTION = '^@iconify-json/'
const COLLECTION_SCOPE = '@iconify-json/'
const SOURCES = '{src,tooling}/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'
const ICON_PREFIX = 'icon:'
// The text of an import, a re-export or a dynamic import of an icon module,
// which a comment or a string can also have.
const ICON_SPECIFIER = /\b(?:from|import)\s*\(?\s*["'`]icon:/u
// The argument of a dynamic import that Knip reads, as the source spells it: a
// string, or a template without an expression. Knip reads no path that the
// code builds, such as 'icon:brand/' + name, so an ignore for it would be a
// configuration hint.
const ICON_STRING =
  /^(?:(?<quote>["'])icon:[^"']*\k<quote>|`icon:(?:[^$`]|\$(?!\{))*`)$/u
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies'
]

// WHY: Knip reads the imports with a parser, so an icon: in a comment or a
// string has no import that uses the ignore, and the hint of the unused ignore
// fails the run. The parser of vite-plus reads the files that the text points
// at, and is loaded only for them.
async function hasIconImport({ file, source }: ModuleSource): Promise<boolean> {
  const { parse } = await import('vite-plus')
  const { module } = await parse(file, source)
  return (
    module.staticImports.some(({ moduleRequest }) =>
      moduleRequest.value.startsWith(ICON_PREFIX)
    ) ||
    module.staticExports.some(({ entries }) =>
      entries.some(({ moduleRequest }) =>
        Boolean(moduleRequest?.value.startsWith(ICON_PREFIX))
      )
    ) ||
    module.dynamicImports.some(({ moduleRequest }) =>
      ICON_STRING.test(source.slice(moduleRequest.start, moduleRequest.end))
    )
  )
}

async function importsIcons(root: string): Promise<boolean> {
  for await (const file of glob(SOURCES, { cwd: root })) {
    const source = await readFile(path.join(root, file), 'utf8')
    if (
      ICON_SPECIFIER.test(source) &&
      (await hasIconImport({ file, source }))
    ) {
      return true
    }
  }
  return false
}

async function declaresCollection(root: string): Promise<boolean> {
  let manifest: unknown
  try {
    manifest = JSON.parse(
      await readFile(path.join(root, 'package.json'), 'utf8')
    )
  } catch {
    return false
  }
  if (manifest === null || typeof manifest !== 'object') return false
  return DEPENDENCY_FIELDS.some(field => {
    const versions: unknown = Reflect.get(manifest, field)
    return (
      versions !== null &&
      typeof versions === 'object' &&
      Object.keys(versions).some(name => name.startsWith(COLLECTION_SCOPE))
    )
  })
}

// The icons plugin of the preset resolves the icon: imports and loads each
// Iconify collection by its name, so Knip sees neither. WHY: an ignore that
// matches nothing is a configuration hint, which fails the run, so each one
// is added only when the application has what it ignores.
export async function iconIgnores(root: string): Promise<string[]> {
  const [isImporting, hasCollection] = await Promise.all([
    importsIcons(root),
    declaresCollection(root)
  ])
  return [
    ...(isImporting ? [ICON_IMPORT] : []),
    ...(hasCollection ? [ICON_COLLECTION] : [])
  ]
}
