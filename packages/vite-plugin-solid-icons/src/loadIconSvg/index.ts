import path from 'node:path'

import {
  getCustomIcon,
  type IconifyLoaderOptions,
  searchForIcon
} from '@iconify/utils'
import { FileSystemHMRIconLoader } from '@iconify/utils/lib/loader/node-loaders'
import { getPossibleIconNames } from '@iconify/utils/lib/loader/utils'

import { loadIconSet } from '../loadIconSet/index.ts'
import type { IconCustomizer } from '../types.ts'

type IconSource = {
  collection: string
  name: string
  root: string
  // The folder of the collection when the application declared it.
  folder: string | undefined
  customizeIcon: IconCustomizer | undefined
}
type FolderSource = IconSource & { folder: string }
type IconSvg = { svg: string; file: string | undefined }

// WHY: icons render at 1.2 times the font size, the size the applications
// are styled for.
const ICON_SCALE = 1.2
const COLLECTION_SCOPE = '@iconify-json'

function loaderOptions(
  customizeIcon: IconCustomizer | undefined
): IconifyLoaderOptions {
  return {
    addXmlNs: false,
    scale: ICON_SCALE,
    customizations: {
      // oxlint-disable-next-line eslint/max-params -- @iconify/utils calls the customizer with three arguments.
      iconCustomizer: async (collection, name, attributes) => {
        await customizeIcon?.({ collection, name, attributes })
      }
    }
  }
}

async function loadFolderIcon({
  collection,
  name,
  folder,
  root,
  customizeIcon
}: FolderSource): Promise<IconSvg> {
  const loader = FileSystemHMRIconLoader(folder, collection)[collection]
  const svg =
    loader &&
    (await getCustomIcon(
      loader,
      collection,
      name,
      loaderOptions(customizeIcon)
    ))
  if (!loader || svg === undefined) {
    const relative = path.relative(root, folder) || '.'
    throw new Error(
      `Icon "${collection}/${name}" not found: the folder "${relative}" of the collection "${collection}" has no ${name}.svg.`
    )
  }
  return { svg, file: loader.resolveSVGIconPath(name) }
}

async function loadInstalledIcon({
  collection,
  name,
  root,
  customizeIcon
}: IconSource): Promise<IconSvg> {
  const packageName = `${COLLECTION_SCOPE}/${collection}`
  const iconSet = await loadIconSet({ collection, root })
  const svg = await searchForIcon(
    iconSet,
    collection,
    getPossibleIconNames(name),
    loaderOptions(customizeIcon)
  )
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
