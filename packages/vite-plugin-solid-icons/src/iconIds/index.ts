type RequestPart = { specifier: string; part: string }

const ICON_PREFIX = 'icon:'
const RAW_PREFIX = `\0${ICON_PREFIX}`
const COMPONENT_SUFFIX = '.tsx'
const COLLECTION_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const RAW_SUFFIX = '.js'
// A dot only between characters, so a name cannot climb out of the folder of
// a collection or read a hidden file.
const NAME_PATTERN = /^[\w-]+(?:\.[\w-]+)*$/u
const USAGE =
  "Import an icon as 'icon:<collection>/<name>', or 'icon:<collection>/<name>?raw' for the SVG text."

function invalidRequest(specifier: string): Error {
  return new Error(`Invalid icon import "${specifier}". ${USAGE}`)
}

function isRawQuery({ specifier, part: query }: RequestPart): boolean {
  if (query === '') return false
  const params = new URLSearchParams(query)
  const keys = [...params.keys()]
  if (keys.length === 1 && keys[0] === 'raw' && params.get('raw') === '') {
    return true
  }
  throw new Error(
    `Unsupported query in the icon import "${specifier}": only ?raw is accepted.`
  )
}

function splitPath({ specifier, part: path }: RequestPart): IconRequest {
  const slash = path.indexOf('/')
  if (slash === -1) throw invalidRequest(specifier)
  const collection = path.slice(0, slash)
  const name = path.slice(slash + 1)
  if (!COLLECTION_PATTERN.test(collection) || !NAME_PATTERN.test(name)) {
    throw invalidRequest(specifier)
  }
  return { collection, name, isRaw: false }
}

export type IconPath = { collection: string; name: string }

export type IconRequest = IconPath & { isRaw: boolean }

export function isCollectionName(name: string): boolean {
  return COLLECTION_PATTERN.test(name)
}

export function isIconName(name: string): boolean {
  return NAME_PATTERN.test(name)
}

// The collection of an import by export name, as in 'icon:hugeicons'.
export function collectionOfImport(specifier: string): string | undefined {
  if (!specifier.startsWith(ICON_PREFIX)) return undefined
  const collection = specifier.slice(ICON_PREFIX.length)
  return COLLECTION_PATTERN.test(collection) ? collection : undefined
}

export function iconImport({ collection, name }: IconPath): string {
  return `${ICON_PREFIX}${collection}/${name}`
}

// The ids that load receives. The component id ends in .tsx and has no null
// byte, so the Solid plugin compiles it; the raw id stays away from the ?raw
// handling of Vite and from the Solid plugin.
export function readIconId(id: string): IconRequest | undefined {
  if (id.startsWith(RAW_PREFIX) && id.endsWith(RAW_SUFFIX)) {
    const path = id.slice(RAW_PREFIX.length, -RAW_SUFFIX.length)
    return { ...splitPath({ specifier: id, part: path }), isRaw: true }
  }
  if (id.startsWith(ICON_PREFIX) && id.endsWith(COMPONENT_SUFFIX)) {
    const path = id.slice(ICON_PREFIX.length, -COMPONENT_SUFFIX.length)
    return splitPath({ specifier: id, part: path })
  }
  return undefined
}

export function iconId({ collection, name, isRaw }: IconRequest): string {
  return isRaw
    ? `${RAW_PREFIX}${collection}/${name}${RAW_SUFFIX}`
    : `${ICON_PREFIX}${collection}/${name}${COMPONENT_SUFFIX}`
}

// The dev server requests a module by its resolved id again, so a resolved id
// resolves to itself.
export function parseIconRequest(specifier: string): IconRequest | undefined {
  const resolved = readIconId(specifier)
  if (resolved) return resolved
  if (!specifier.startsWith(ICON_PREFIX)) return undefined
  const [path = '', ...query] = specifier.slice(ICON_PREFIX.length).split('?')
  if (query.length > 1) throw invalidRequest(specifier)
  const request = splitPath({ specifier, part: path })
  return { ...request, isRaw: isRawQuery({ specifier, part: query[0] ?? '' }) }
}
