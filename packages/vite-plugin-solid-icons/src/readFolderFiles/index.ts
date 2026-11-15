import { lstat, readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'

import { errorCode } from '../errorText/index.ts'
import { isIconName } from '../iconIds/index.ts'

// A file as the listing of its folder found it: a file saved again in its
// place keeps it, and a new file under the same name has another.
type FileIdentity = { dev: bigint; ino: bigint }
type FolderPlace = { collection: string; folder: string; root: string }
type FolderRead = FolderPlace & { identity: FolderIdentity }
type FileCheck = { folder: string; name: string }
type ListedFile = { name: string; identity: FileIdentity | undefined }
type UnreadableInput = FolderPlace & { error: unknown }
type FilePair = { first: FileIdentity; second: FileIdentity }

const SVG_EXTENSION = '.svg'

function isMissing(error: unknown): boolean {
  return errorCode(error) === 'ENOENT'
}

async function fileIdentity({
  folder,
  name
}: FileCheck): Promise<FileIdentity | undefined> {
  try {
    const stats = await lstat(path.join(folder, name), { bigint: true })
    return stats.isFile() ? { dev: stats.dev, ino: stats.ino } : undefined
  } catch (error) {
    // A file removed while the folder is listed is not in the listing.
    if (isMissing(error)) return undefined
    throw error
  }
}

// The folder that the plugin read first, where a folder configured as a
// link leads.
export type FolderIdentity = FileIdentity & { realPath: string }

export type FolderFiles = {
  // The regular .svg files whose names an import can spell, without the
  // extension, as the listing found them.
  icons: Map<string, FileIdentity>
  // The .svg names that are symbolic links, which the plugin does not read.
  links: Set<string>
  // The .svg files whose names an import cannot spell.
  skipped: string[]
  // The folder that the plugin read first, where the files are read from.
  identity: FolderIdentity
}

export function unreadableFolder({
  collection,
  folder,
  root,
  error
}: UnreadableInput): Error {
  const relative = path.relative(root, folder) || '.'
  return new Error(
    `The folder "${relative}" of the icon collection "${collection}" cannot be read (${errorCode(error)}).`,
    { cause: error }
  )
}

export function isSameFile({ first, second }: FilePair): boolean {
  return first.dev === second.dev && first.ino === second.ino
}

export async function folderIdentity(folder: string): Promise<FolderIdentity> {
  const realPath = await realpath(folder)
  const { dev, ino } = await stat(realPath, { bigint: true })
  return { realPath, dev, ino }
}

// The folder is still the one that the plugin read first: the same real
// path, so a folder replaced by a link to itself is refused, and the same
// device and inode, so another folder of the same name is refused.
export async function checkFolder({
  collection,
  folder,
  root,
  identity
}: FolderRead): Promise<void> {
  let current: FolderIdentity
  try {
    current = await folderIdentity(folder)
  } catch (error) {
    throw unreadableFolder({ collection, folder, root, error })
  }
  const isFirst =
    current.realPath === identity.realPath &&
    isSameFile({ first: current, second: identity })
  if (!isFirst) {
    const relative = path.relative(root, folder) || '.'
    throw new Error(
      `The folder "${relative}" of the icon collection "${collection}" was replaced, or a folder above it was, after the plugin read it first: stop and start the dev server or the build to read the new folder.`
    )
  }
}

// WHY: the folder of the application is the only place an icon of a folder
// collection comes from; a link could read any file of the machine, and the
// watcher would not see its target change. The listing reads the folder that
// the plugin read first, and checks it before and after it lists, so a
// folder replaced in the meantime, or a folder above it, is refused.
export async function readFolderFiles(input: FolderRead): Promise<FolderFiles> {
  const { collection, folder, root, identity } = input
  const files: FolderFiles = {
    icons: new Map(),
    links: new Set(),
    skipped: [],
    identity
  }
  await checkFolder(input)
  let listed: ListedFile[]
  try {
    const entries = await readdir(identity.realPath, { withFileTypes: true })
    const svgs = entries.filter(
      entry => path.extname(entry.name) === SVG_EXTENSION
    )
    for (const entry of svgs) {
      const name = path.basename(entry.name, SVG_EXTENSION)
      if (entry.isSymbolicLink()) files.links.add(name)
      if (entry.isFile() && !isIconName(name)) files.skipped.push(entry.name)
    }
    listed = await Promise.all(
      svgs
        .filter(entry => entry.isFile())
        .map(async entry => ({
          name: path.basename(entry.name, SVG_EXTENSION),
          identity: await fileIdentity({
            folder: identity.realPath,
            name: entry.name
          })
        }))
    )
  } catch (error) {
    throw unreadableFolder({ collection, folder, root, error })
  }
  await checkFolder(input)
  for (const { name, identity: file } of listed) {
    if (file !== undefined && isIconName(name)) files.icons.set(name, file)
  }
  files.skipped.sort()
  return files
}
