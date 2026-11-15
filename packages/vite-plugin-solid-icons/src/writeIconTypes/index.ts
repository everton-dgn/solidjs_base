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

type RenderedFile = TypesFileContent & { warnings: string[] }

async function typesFileContent(
  options: IconTypesOptions
): Promise<RenderedFile> {
  const root = path.resolve(options.root ?? cwd())
  const folders = resolveFolders({
    root,
    collections: options.collections ?? {}
  })
  const tables = createNameTables({ root, folders })
  return {
    file: path.resolve(root, options.typesFile ?? DEFAULT_TYPES_FILE),
    ...(await renderIconTypes({ root, folders, tables }))
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

export type IconTypesFile = {
  file: string
  isChanged: boolean
  // The collections that the file leaves out because they cannot be read,
  // as in a collection of the package.json that is not installed.
  warnings: string[]
}

// Writes the file that the dev server and the build write, for a type check
// that runs before them.
export async function writeIconTypes(
  options: IconTypesOptions = {}
): Promise<IconTypesFile> {
  const { warnings, ...types } = await typesFileContent(options)
  return {
    file: types.file,
    isChanged: await writeTypesFile(types),
    warnings
  }
}

// Fails when the file is missing or differs from the icons, or when a
// collection cannot be read, as a check in the CI.
export async function checkIconTypes(
  options: IconTypesOptions = {}
): Promise<void> {
  const { file, content, warnings } = await typesFileContent(options)
  if (warnings.length > 0) throw new Error(warnings.join('\n'))
  if ((await readTypesFile(file)) === content) return
  const relative = path.relative(path.resolve(options.root ?? cwd()), file)
  throw new Error(
    `${relative} is out of date with the icon collections: write it again with writeIconTypes, the dev server or the build.`
  )
}
