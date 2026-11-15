import path from 'node:path'

import type { Folders } from '../iconCollections/index.ts'

type FileLookup = { folders: Folders; file: string }

const SVG_EXTENSION = '.svg'

export type FileIcon = { collection: string; name: string }

// WHY: Vite reports the files with forward slashes on every system, while
// the folders of the collections come from path.resolve, which writes
// backslashes on Windows.
export function fileKey(file: string): string {
  return path.posix.normalize(file.replaceAll('\\', '/'))
}

// The icon of a file in the folder of a collection, also when no module
// loaded it yet: a new file answers an import that failed before.
export function iconOfFile({
  folders,
  file
}: FileLookup): FileIcon | undefined {
  const key = fileKey(file)
  if (path.posix.extname(key) !== SVG_EXTENSION) return undefined
  const folder = path.posix.dirname(key)
  for (const [collection, collectionFolder] of folders) {
    if (fileKey(collectionFolder) === folder) {
      return { collection, name: path.posix.basename(key, SVG_EXTENSION) }
    }
  }
  return undefined
}
