import { type BigIntStats, constants } from 'node:fs'
import { type FileHandle, open } from 'node:fs/promises'
import path from 'node:path'

import {
  getCustomIcon,
  type IconifyLoaderOptions,
  searchForIcon
} from '@iconify/utils'

import { messageOf } from '../errorText/index.ts'
import { type IconSet, loadIconSet } from '../loadIconSet/index.ts'
import { type FolderFiles, isSameFile } from '../readFolderFiles/index.ts'
import type { IconCustomizer } from '../types.ts'

type IconFolder = {
  // The folder as the application declares it, for the messages and the
  // watcher.
  path: string
  files: FolderFiles
  // Lists the folder again, and checks that it is the one listed first.
  refresh: () => Promise<FolderFiles>
}

type IconSource = {
  collection: string
  name: string
  root: string
  // The folder of the collection when the application declared it.
  folder: IconFolder | undefined
  customizeIcon: IconCustomizer | undefined
}
type FolderSource = IconSource & { folder: IconFolder }
type IconSvg = { svg: string; file: string | undefined }
type FileProblem = 'missing' | 'link' | 'irregular' | 'replaced'
type OpenedFile = FolderSource & { stats: BigIntStats }
type MissingInput = FolderSource & { problem: FileProblem }
type Customization = {
  collection: string
  name: string
  attributes: Record<string, string>
  customizeIcon: IconCustomizer | undefined
}
type ChainInput = { iconSet: IconSet; name: string }
type DrawInput = {
  collection: string
  name: string
  draw: () => Promise<string | undefined>
}

// WHY: icons render at 1.2 times the font size, the size the applications
// are styled for.
const ICON_SCALE = 1.2
const COLLECTION_SCOPE = '@iconify-json'
const SVG_EXTENSION = '.svg'
const SVG_START = '<svg'
// @iconify/utils writes the attributes after "<svg" and one space.
const BARE_SVG_START = /^<svg(?=[/>])/u
// WHY: the listing of the folder is cached, so a file that became a link
// after it is refused when it opens. Without O_NONBLOCK a FIFO in its place
// would block the open. Windows has no O_NOFOLLOW, and keeps the checks of
// the listing and of the identity of the file.
const OPTIONAL_FLAGS: (number | undefined)[] = [
  constants.O_NOFOLLOW,
  constants.O_NONBLOCK
]
const OPEN_FLAGS = OPTIONAL_FLAGS.reduce<number>(
  (flags, flag) => flags | (flag ?? 0),
  constants.O_RDONLY
)
const ATTRIBUTE_NAME = /^[A-Za-z_][\w.:-]*$/u
const MARKUP_CHARACTERS = /[&"<>]/gu
const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '"': '&quot;',
  '<': '&lt;',
  '>': '&gt;'
}

// An error of the attributes that customizeIcon sets, which names the icon.
class CustomizerError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'CustomizerError'
  }
}

function escapeValue(value: string): string {
  return value.replaceAll(
    MARKUP_CHARACTERS,
    character => ESCAPES[character] ?? character
  )
}

// @iconify/utils writes each attribute as name="value", as it is; the values
// that the customizer sets are text, escaped here.
async function customize({
  collection,
  name,
  attributes,
  customizeIcon
}: Customization): Promise<void> {
  if (!customizeIcon) return
  const before = { ...attributes }
  await customizeIcon({ collection, name, attributes })
  const icon = `"${collection}/${name}"`
  for (const [attribute, value] of Object.entries(attributes)) {
    const written: unknown = value
    if (before[attribute] === written) continue
    if (!ATTRIBUTE_NAME.test(attribute)) {
      throw new CustomizerError(
        `customizeIcon set the attribute "${attribute}" on the icon ${icon}: an attribute name starts with a letter or "_" and has letters, digits, "_", "-", "." or ":".`
      )
    }
    if (typeof written !== 'string') {
      throw new CustomizerError(
        `customizeIcon set the attribute ${attribute} of the icon ${icon} to a ${typeof written}: an attribute value is a string.`
      )
    }
    attributes[attribute] = escapeValue(written)
  }
}

function loaderOptions(
  customizeIcon: IconCustomizer | undefined
): IconifyLoaderOptions {
  return {
    addXmlNs: false,
    scale: ICON_SCALE,
    customizations: {
      // oxlint-disable-next-line eslint/max-params -- @iconify/utils calls the customizer with three arguments.
      iconCustomizer: (collection, name, attributes) =>
        customize({ collection, name, attributes, customizeIcon })
    }
  }
}

function missingFolderIcon({
  collection,
  name,
  root,
  folder,
  problem
}: MissingInput): Error {
  const relative = path.relative(root, folder.path) || '.'
  const file = `${name}${SVG_EXTENSION}`
  const place = `in the folder "${relative}" of the collection "${collection}"`
  const lowerName = name.toLowerCase()
  const sameLetters = [...folder.files.icons.keys()].find(
    icon => icon.toLowerCase() === lowerName
  )
  const reasons: Record<FileProblem, string> = {
    missing: `the folder "${relative}" of the collection "${collection}" has no ${file}`,
    link: `${file} ${place} is a symbolic link, and the plugin reads regular files only`,
    irregular: `${file} ${place} is not a regular file, and the plugin reads regular files only`,
    replaced: `${file} ${place} is not the file that the plugin listed there, but a hard link or a file from another folder, and the plugin reads only the files of the listing`
  }
  const hint =
    sameLetters === undefined || problem !== 'missing'
      ? ''
      : `; names are case-sensitive, and the folder has ${sameLetters}${SVG_EXTENSION}`
  return new Error(
    `Icon "${collection}/${name}" not found: ${reasons[problem]}${hint}.`
  )
}

function openProblem(error: unknown): FileProblem | undefined {
  const code = error instanceof Error && 'code' in error ? error.code : ''
  if (code === 'ENOENT') return 'missing'
  if (code === 'ELOOP') return 'link'
  return undefined
}

async function openFolderFile(source: FolderSource): Promise<FileHandle> {
  const { name, folder } = source
  try {
    return await open(
      path.join(folder.files.realPath, `${name}${SVG_EXTENSION}`),
      OPEN_FLAGS
    )
  } catch (error) {
    const problem = openProblem(error)
    if (problem) throw missingFolderIcon({ ...source, problem })
    throw error
  }
}

// The opened file is the one of the listing. An editor that saves to a new
// file and renames it over the icon gives it another identity: the folder is
// listed again, which checks the folder too, and the new file is read when
// that listing has it and it is no hard link, which a file outside the
// folder could be.
async function checkListedFile({
  stats,
  ...source
}: OpenedFile): Promise<void> {
  const { name, folder } = source
  const listed = folder.files.icons.get(name)
  if (listed && isSameFile(listed, stats)) return
  const files = await folder.refresh()
  const relisted = files.icons.get(name)
  if (relisted && isSameFile(relisted, stats) && stats.nlink === 1n) return
  throw missingFolderIcon({ ...source, problem: 'replaced' })
}

// The file is read only when the listing of the folder has its exact name,
// so a name never reaches a file outside the folder, a link or a file whose
// name differs in case. The open checks the file again, as it is now.
async function readFolderSvg(source: FolderSource): Promise<string> {
  const { collection, name, folder } = source
  if (!folder.files.icons.has(name)) {
    const problem = folder.files.links.has(name) ? 'link' : 'missing'
    throw missingFolderIcon({ ...source, problem })
  }
  const handle = await openFolderFile(source)
  let text: string
  try {
    const stats = await handle.stat({ bigint: true })
    if (!stats.isFile()) {
      throw missingFolderIcon({ ...source, problem: 'irregular' })
    }
    await checkListedFile({ ...source, stats })
    text = await handle.readFile('utf8')
  } finally {
    await handle.close()
  }
  const start = text.indexOf(SVG_START)
  if (start === -1) {
    throw new Error(
      `Icon "${collection}/${name}": the file has no <svg> root element.`
    )
  }
  // What comes before the root, such as a DOCTYPE, is not part of the icon.
  return text.slice(start).replace(BARE_SVG_START, `${SVG_START} `)
}

// An error of @iconify/utils, or of a customizeIcon that throws, names the
// icon it stopped.
async function drawIcon({
  collection,
  name,
  draw
}: DrawInput): Promise<string | undefined> {
  try {
    return await draw()
  } catch (error) {
    if (error instanceof CustomizerError) throw error
    throw new Error(
      `Icon "${collection}/${name}" cannot be drawn: ${messageOf(error)}`,
      { cause: error }
    )
  }
}

async function loadFolderIcon(source: FolderSource): Promise<IconSvg> {
  const { collection, name, folder, customizeIcon } = source
  const text = await readFolderSvg(source)
  const svg = await drawIcon({
    collection,
    name,
    draw: () =>
      getCustomIcon(() => text, collection, name, loaderOptions(customizeIcon))
  })
  return {
    svg: svg ?? text,
    file: path.join(folder.path, `${name}${SVG_EXTENSION}`)
  }
}

// WHY: @iconify/utils looks an icon and its parents up as icons[name], where
// a name such as toString finds a member of every object. The icon set it
// receives holds only the own icon and aliases of the name, in objects
// without a prototype; a chain that leaves the own properties, loops or ends
// in an icon without a body finds nothing.
function ownIconChain({ iconSet, name }: ChainInput): IconSet | undefined {
  const icons: IconSet['icons'] = {}
  const aliases: NonNullable<IconSet['aliases']> = {}
  Object.setPrototypeOf(icons, null)
  Object.setPrototypeOf(aliases, null)
  const allAliases = iconSet.aliases ?? {}
  let current = name
  while (!Object.hasOwn(iconSet.icons, current)) {
    const isAlias =
      Object.hasOwn(allAliases, current) && !Object.hasOwn(aliases, current)
    const alias = isAlias ? allAliases[current] : undefined
    if (typeof alias?.parent !== 'string') return undefined
    aliases[current] = alias
    current = alias.parent
  }
  const icon = iconSet.icons[current]
  if (typeof icon?.body !== 'string') return undefined
  icons[current] = icon
  return { ...iconSet, icons, aliases }
}

async function loadInstalledIcon({
  collection,
  name,
  root,
  customizeIcon
}: IconSource): Promise<IconSvg> {
  const packageName = `${COLLECTION_SCOPE}/${collection}`
  // WHY: the exact name only, as in a folder, so one icon has one module.
  const chain = ownIconChain({
    iconSet: await loadIconSet({ collection, root }),
    name
  })
  const svg =
    chain &&
    (await drawIcon({
      collection,
      name,
      draw: () =>
        searchForIcon(chain, collection, [name], loaderOptions(customizeIcon))
    }))
  if (svg === undefined) {
    throw new Error(`Icon "${collection}/${name}" not found in ${packageName}.`)
  }
  return { svg, file: undefined }
}

export function loadIconSvg(source: IconSource): Promise<IconSvg> {
  const { folder } = source
  return folder === undefined
    ? loadInstalledIcon(source)
    : loadFolderIcon({ ...source, folder })
}
