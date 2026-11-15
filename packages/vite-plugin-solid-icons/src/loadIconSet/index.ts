import { loadCollectionFromFS } from '@iconify/utils/lib/loader/fs'

type CollectionSource = { collection: string; root: string }

const COLLECTION_SCOPE = '@iconify-json'

export type IconSet = NonNullable<
  Awaited<ReturnType<typeof loadCollectionFromFS>>
>

// The icon set of @iconify-json/<collection>, as the application installed
// it.
export async function loadIconSet({
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
