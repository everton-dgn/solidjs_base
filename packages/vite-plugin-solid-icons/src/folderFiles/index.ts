import { readdir } from 'node:fs/promises'
import path from 'node:path'

import { errorCode } from '../errorText/index.ts'
import { isIconName } from '../iconIds/index.ts'

type FolderRead = { collection: string; folder: string; root: string }

const SVG_EXTENSION = '.svg'

export type FolderFiles = {
  // The regular .svg files whose names an import can spell, without the
  // extension.
  icons: Set<string>
  // The .svg names that are symbolic links, which the plugin does not read.
  links: Set<string>
  // The .svg files whose names an import cannot spell.
  skipped: string[]
}

// WHY: the folder of the application is the only place an icon of a folder
// collection comes from; a link could read any file of the machine, and the
// watcher would not see its target change.
export async function readFolderFiles({
  collection,
  folder,
  root
}: FolderRead): Promise<FolderFiles> {
  let entries
  try {
    entries = await readdir(folder, { withFileTypes: true })
  } catch (error) {
    const relative = path.relative(root, folder) || '.'
    throw new Error(
      `The folder "${relative}" of the icon collection "${collection}" cannot be read (${errorCode(error)}).`,
      { cause: error }
    )
  }
  const files: FolderFiles = { icons: new Set(), links: new Set(), skipped: [] }
  for (const entry of entries) {
    if (path.extname(entry.name) !== SVG_EXTENSION) continue
    const name = path.basename(entry.name, SVG_EXTENSION)
    if (entry.isSymbolicLink()) files.links.add(name)
    if (!entry.isFile()) continue
    if (isIconName(name)) files.icons.add(name)
    else files.skipped.push(entry.name)
  }
  files.skipped.sort()
  return files
}
