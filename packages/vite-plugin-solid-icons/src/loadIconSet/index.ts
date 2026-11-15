import { loadCollectionFromFS } from '@iconify/utils/lib/loader/fs'

type CollectionSource = { collection: string; root: string }

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
