import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'

import type { Plugin } from 'vite-plus'

type SourcePackagesOptions = { root: string; packages: string[] }
type PackageLookup = { root: string; name: string }
type InstalledPackage = { dir: string; exports: Record<string, unknown> }
type SourceRequest = { name: string; source: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// The installed package is looked up the way Node does, from the application
// folder up. A missing package resolves to nothing, so an application without
// it pays only the prefix check of each import.
async function findPackage({
  root,
  name
}: PackageLookup): Promise<InstalledPackage | undefined> {
  for (let dir = root; ; dir = path.dirname(dir)) {
    const packageDir = path.join(dir, 'node_modules', name)
    try {
      const manifest: unknown = JSON.parse(
        await readFile(path.join(packageDir, 'package.json'), 'utf8')
      )
      return isRecord(manifest) && isRecord(manifest.exports)
        ? { dir: packageDir, exports: manifest.exports }
        : undefined
    } catch {
      if (path.dirname(dir) === dir) return undefined
    }
  }
}

// The node project does not load the Solid plugin, the one that adds the solid
// export condition, and the condition cannot go to the whole project: the
// router would then resolve to its .jsx source. This plugin applies it only to
// the subpaths of the packages that ship TypeScript source.
export function sourcePackages({
  root,
  packages
}: SourcePackagesOptions): Plugin {
  const installed = new Map<string, Promise<InstalledPackage | undefined>>()

  async function resolveSource({
    name,
    source
  }: SourceRequest): Promise<string | null> {
    let lookup = installed.get(name)
    if (!lookup) {
      lookup = findPackage({ root, name })
      installed.set(name, lookup)
    }
    const found = await lookup
    const entry = found?.exports[`.${source.slice(name.length)}`]
    if (!found || !isRecord(entry) || typeof entry.solid !== 'string') {
      return null
    }
    // WHY: the real path is the id that the relative imports inside the
    // package resolve to, so each module loads once.
    return realpath(path.join(found.dir, entry.solid))
  }

  return {
    name: 'solid-tooling:source-packages',
    enforce: 'pre',
    resolveId(source) {
      const name = packages.find(
        candidate => source === candidate || source.startsWith(`${candidate}/`)
      )
      return name === undefined ? null : resolveSource({ name, source })
    }
  }
}
