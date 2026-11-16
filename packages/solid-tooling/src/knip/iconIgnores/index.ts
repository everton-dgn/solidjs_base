import { glob, readFile } from 'node:fs/promises'
import path from 'node:path'

// Knip reads icon:<collection>/<name> as an import of a package named icon.
const ICON_IMPORT = 'icon'
// Knip reads a string with a regular expression character as a RegExp.
const ICON_COLLECTION = '^@iconify-json/'
const COLLECTION_SCOPE = '@iconify-json/'
const SOURCES = '{src,tooling}/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'
// An import, a re-export or a dynamic import of an icon module.
const ICON_SPECIFIER = /\b(?:from|import)\s*\(?\s*['"]icon:/u
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies'
]

async function importsIcons(root: string): Promise<boolean> {
  for await (const file of glob(SOURCES, { cwd: root })) {
    if (ICON_SPECIFIER.test(await readFile(path.join(root, file), 'utf8'))) {
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
