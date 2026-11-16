import { glob, readFile } from 'node:fs/promises'
import path from 'node:path'

import { parseJson, readFields } from '../mergePullRequest/json.ts'
import type { DependencyField, PackedPackage, PinnedPackage } from './types.ts'

type JsonRecord = Record<string, unknown>

type PinnedSearch = { manifest: unknown; names: ReadonlySet<string> }

type Section = PinnedSearch & { field: DependencyField; packed: string }

const MANIFEST_LABEL = 'the package.json of the tarball'
// A version without a range, such as 0.8.0 or 1.0.0-rc.1, which is what the
// pack writes for workspace:*.
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[\da-z.-]+)?(?:\+[\da-z.-]+)?$/iu

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readWorkspaces(manifest: unknown): string[] {
  const workspaces = isRecord(manifest) ? manifest.workspaces : undefined
  if (
    !Array.isArray(workspaces) ||
    workspaces.length === 0 ||
    !workspaces.every(pattern => typeof pattern === 'string')
  ) {
    throw new TypeError(
      'The package.json at the workspace root has no workspaces list, so the packages of this repository are unknown.'
    )
  }
  return workspaces
}

function readSection({
  manifest,
  names,
  field,
  packed
}: Section): PinnedPackage[] {
  const section = isRecord(manifest) ? manifest[field] : undefined
  if (section === undefined || section === null) return []
  if (!isRecord(section)) {
    throw new TypeError(
      `${MANIFEST_LABEL} has a ${field} that is not an object.`
    )
  }
  return Object.entries(section)
    .filter(([name]) => names.has(name))
    .map(([name, version]) => {
      if (typeof version !== 'string' || !EXACT_VERSION.test(version)) {
        throw new Error(
          `${packed} pins ${name} as ${JSON.stringify(version)} in ${field}, not as an exact version, so there is no version to wait for. Declare it as "workspace:*" and pack with vp pm pack, as the publish job does.`
        )
      }
      return { name, version, field }
    })
}

export const DEPENDENCY_FIELDS: readonly DependencyField[] = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies'
]

export async function readWorkspaceNames(root: string): Promise<Set<string>> {
  const file = path.join(root, 'package.json')
  const manifest = parseJson({
    text: await readFile(file, 'utf8'),
    label: file
  })
  const patterns = readWorkspaces(manifest).map(
    pattern => `${pattern}/package.json`
  )
  const files: string[] = []
  for await (const found of glob(patterns, { cwd: root })) files.push(found)
  // A workspace without a name, such as a private application, cannot be
  // pinned by another package.
  const names = await Promise.all(
    files.map(async found => {
      const label = path.join(root, found)
      const text = await readFile(label, 'utf8')
      return readFields({
        value: parseJson({ text, label }),
        label
      }).optionalString('name')
    })
  )
  const named = names.filter(name => name !== undefined)
  if (named.length === 0) {
    throw new Error(
      `The workspaces of ${file} match no package.json with a name, so the packages of this repository are unknown.`
    )
  }
  return new Set(named)
}

export function findPinnedPackages({
  manifest,
  names
}: PinnedSearch): PackedPackage {
  const fields = readFields({ value: manifest, label: MANIFEST_LABEL })
  const name = fields.string('name')
  const version = fields.string('version')
  const packed = `${name}@${version}`
  if (!names.has(name)) {
    throw new Error(
      `${name} is not a package of this repository, so the packages it pins cannot be told from the others. Run the command from this repository on a tarball of one of its packages.`
    )
  }
  return {
    name,
    version,
    pinned: DEPENDENCY_FIELDS.flatMap(field =>
      readSection({ manifest, names, field, packed })
    )
  }
}
