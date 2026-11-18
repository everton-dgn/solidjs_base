import { readFile } from 'node:fs/promises'
import path from 'node:path'

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies'
]

export async function readDependencies(root: string): Promise<string[]> {
  let manifest: unknown
  try {
    manifest = JSON.parse(
      await readFile(path.join(root, 'package.json'), 'utf8')
    )
  } catch {
    return []
  }
  if (manifest === null || typeof manifest !== 'object') return []
  return DEPENDENCY_FIELDS.flatMap(field => {
    const versions: unknown = Reflect.get(manifest, field)
    return versions !== null && typeof versions === 'object'
      ? Object.keys(versions)
      : []
  })
}
