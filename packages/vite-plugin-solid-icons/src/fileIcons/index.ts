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

// The icons of a file in the folders of the collections, also when no
// module loaded them yet: a new file answers an import that failed before.
// Two collections may share a folder, and each has the file as an icon.
export function iconsOfFile({ folders, file }: FileLookup): FileIcon[] {
  const key = fileKey(file)
  if (path.posix.extname(key) !== SVG_EXTENSION) return []
  const folder = path.posix.dirname(key)
  const name = path.posix.basename(key, SVG_EXTENSION)
  return [...folders]
    .filter(([, collectionFolder]) => fileKey(collectionFolder) === folder)
    .map(([collection]) => ({ collection, name }))
}
