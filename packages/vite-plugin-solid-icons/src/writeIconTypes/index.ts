import path from 'node:path'
import { cwd } from 'node:process'

import { createNameTables, resolveFolders } from '../iconCollections/index.ts'
import {
  DEFAULT_TYPES_FILE,
  readTypesFile,
  renderIconTypes,
  type TypesFileContent,
  writeTypesFile
} from '../iconTypes/index.ts'

async function typesFileContent(
  options: IconTypesOptions
): Promise<TypesFileContent> {
  const root = path.resolve(options.root ?? cwd())
  const folders = resolveFolders({
    root,
    collections: options.collections ?? {}
  })
  const tables = createNameTables({ root, folders })
  return {
    file: path.resolve(root, options.typesFile ?? DEFAULT_TYPES_FILE),
    content: await renderIconTypes({ root, folders, tables })
  }
}

export type IconTypesOptions = {
  // The root of the application; the current folder by default.
  root?: string
  // The folders of SVG files by collection name, as solidIcons takes them.
  collections?: Record<string, string>
  // The file to write, relative to the root.
  typesFile?: string
}

export type IconTypesFile = { file: string; isChanged: boolean }

// Writes the file that the dev server and the build write, for a type check
// that runs before them.
export async function writeIconTypes(
  options: IconTypesOptions = {}
): Promise<IconTypesFile> {
  const types = await typesFileContent(options)
  return { file: types.file, isChanged: await writeTypesFile(types) }
}

// Fails when the file is missing or differs from the icons, as a check in
// the CI.
export async function checkIconTypes(
  options: IconTypesOptions = {}
): Promise<void> {
  const { file, content } = await typesFileContent(options)
  if ((await readTypesFile(file)) === content) return
  const relative = path.relative(path.resolve(options.root ?? cwd()), file)
  throw new Error(
    `${relative} is out of date with the icon collections: write it again with writeIconTypes, the dev server or the build.`
  )
}
