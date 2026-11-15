import { loadCollectionFromFS } from '@iconify/utils/lib/loader/fs'

type CollectionSource = { collection: string; root: string }
type ChainInput = { iconSet: IconSet; name: string }

const COLLECTION_SCOPE = '@iconify-json'
// WHY: @iconify/utils keeps the promise only after its first await, so the
// loads that a build starts at once each read and parse icons.json.
const iconSets = new Map<string, Promise<IconSet>>()

async function readIconSet({
  collection,
  root
}: CollectionSource): Promise<IconSet> {
  const iconSet = await loadCollectionFromFS(
    collection,
    false,
    COLLECTION_SCOPE,
    root
  )
  if (!iconSet) {
    throw new Error(
      `Icon collection "${collection}" not found: install ${COLLECTION_SCOPE}/${collection} or declare "${collection}" in the collections option of solidIcons.`
    )
  }
  return iconSet
}

export type IconSet = NonNullable<
  Awaited<ReturnType<typeof loadCollectionFromFS>>
>

// The icon set of @iconify-json/<collection>, as the application installed
// it, read once per process and root. A collection that is not installed is
// looked up again, so installing it fixes the import.
export function loadIconSet(source: CollectionSource): Promise<IconSet> {
  const key = `${source.root}\0${source.collection}`
  const known = iconSets.get(key)
  if (known) return known
  const loading = (async () => {
    try {
      return await readIconSet(source)
    } catch (error) {
      iconSets.delete(key)
      throw error
    }
  })()
  iconSets.set(key, loading)
  return loading
}

// WHY: @iconify/utils looks an icon and its parents up as icons[name], where
// a name such as toString finds a member of every object. The icon set it
// receives holds only the own icon and aliases of the name, in objects
// without a prototype; a chain that leaves the own properties, loops or ends
// in an icon without a body finds nothing.
export function ownIconChain({
  iconSet,
  name
}: ChainInput): IconSet | undefined {
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
