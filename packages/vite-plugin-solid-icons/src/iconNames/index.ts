import { iconImport } from '../iconIds/index.ts'

type AmbiguousIcon = {
  // The name of the icon or alias that claims the export name.
  name: string
  // The icon the import loads.
  icon: string
  // The export name that still reaches the icon, if any.
  strictName: string | undefined
}

type NameLookup =
  | { kind: 'icon'; icon: string }
  | { kind: 'ambiguous'; icons: AmbiguousIcon[] }
  | { kind: 'missing'; suggestion: string | undefined }

type Candidate = { name: string; icon: string }
type LookupInput = { table: NameTable; exportName: string }
type DistanceInput = { from: string; to: string }
type Suggestion = { name: string; distance: number }
type ChoiceInput = { collection: string; icon: AmbiguousIcon }
type ExportInput = LookupInput & { collection: string }

const SEPARATOR = /[^a-zA-Z0-9]+/u
const DIGIT_START = /^\d/u
// WHY: an identifier cannot start with a digit.
const DIGIT_PREFIX = 'Icon'
const STRICT_DIGIT_SEPARATOR = '_'
// A suggestion further than this from the name would rather confuse.
const MAX_SUGGESTION_DISTANCE = 3

function capitalize(part: string): string {
  return part.charAt(0).toUpperCase() + part.slice(1)
}

function identifier(joined: string): string {
  return DIGIT_START.test(joined) ? `${DIGIT_PREFIX}${joined}` : joined
}

function parts(name: string): string[] {
  return name.split(SEPARATOR).filter(part => part !== '')
}

function compare(first: string, second: string): number {
  if (first === second) return 0
  return first < second ? -1 : 1
}

// arrow-left-01 is ArrowLeft01, and 3d-move is Icon3dMove.
function plainExportName(name: string): string {
  const joined = parts(name)
    .map(part => capitalize(part))
    .join('')
  return joined === '' ? '' : identifier(joined)
}

// The name of an icon whose export name another icon also claims: a group of
// digits after a separator keeps an underscore, so arrow-down-01 is
// ArrowDown_01 while arrow-down01 is still ArrowDown01.
function strictExportName(name: string): string {
  const joined = parts(name)
    .map((part, index) =>
      index > 0 && DIGIT_START.test(part)
        ? `${STRICT_DIGIT_SEPARATOR}${part}`
        : capitalize(part)
    )
    .join('')
  return joined === '' ? '' : identifier(joined)
}

function candidates({ icons, aliases }: IconList): Candidate[] {
  const known = new Set(icons)
  const list = [
    ...icons.map(name => ({ name, icon: name })),
    ...Object.entries(aliases)
      .filter(([, icon]) => known.has(icon))
      .map(([name, icon]) => ({ name, icon }))
  ]
  return list.toSorted((first, second) => compare(first.name, second.name))
}

function groupByExportName(list: Candidate[]): Map<string, Candidate[]> {
  const groups = new Map<string, Candidate[]>()
  for (const candidate of list) {
    const name = plainExportName(candidate.name)
    if (name !== '') groups.set(name, [...(groups.get(name) ?? []), candidate])
  }
  return groups
}

function iconsOf(group: Candidate[]): Set<string> {
  return new Set(group.map(candidate => candidate.icon))
}

// The names are ASCII identifiers, one code unit per character.
function characters(text: string): string[] {
  return Array.from({ length: text.length }, (_, index) => text.charAt(index))
}

function distance({ from, to }: DistanceInput): number {
  let previous = Array.from({ length: to.length + 1 }, (_, index) => index)
  for (const [row, fromChar] of characters(from).entries()) {
    const current = [row + 1]
    for (const [column, toChar] of characters(to).entries()) {
      const substitution =
        (previous[column] ?? 0) + (fromChar === toChar ? 0 : 1)
      const insertion = (current[column] ?? 0) + 1
      const deletion = (previous[column + 1] ?? 0) + 1
      current.push(Math.min(substitution, insertion, deletion))
    }
    previous = current
  }
  return previous[to.length] ?? 0
}

function closestName({
  table,
  exportName: name
}: LookupInput): string | undefined {
  const lowerName = name.toLowerCase()
  let best: Suggestion | undefined
  const names = [...table.exports.keys(), ...table.ambiguous.keys()].toSorted(
    compare
  )
  for (const known of names) {
    const score = distance({ from: lowerName, to: known.toLowerCase() })
    if (score <= MAX_SUGGESTION_DISTANCE && (!best || score < best.distance)) {
      best = { name: known, distance: score }
    }
  }
  return best?.name
}

function lookupExport(input: LookupInput): NameLookup {
  const icon = input.table.exports.get(input.exportName)
  if (icon !== undefined) return { kind: 'icon', icon }
  const icons = input.table.ambiguous.get(input.exportName)
  if (icons) return { kind: 'ambiguous', icons }
  return { kind: 'missing', suggestion: closestName(input) }
}

function choice({ collection, icon }: ChoiceInput): string {
  return icon.strictName === undefined
    ? `'${iconImport({ collection, name: icon.name })}' for ${icon.name}`
    : `${icon.strictName} for ${icon.name}`
}

function choices(list: string[]): string {
  const last = list.at(-1) ?? ''
  return list.length > 1 ? `${list.slice(0, -1).join(', ')}, or ${last}` : last
}

// The icons of a collection and its aliases. An alias maps to the icon whose
// SVG it loads.
export type IconList = { icons: string[]; aliases: Record<string, string> }

export type NameTable = {
  // The icon each export name loads.
  exports: Map<string, string>
  // The export names that two different icons claim, with the icons.
  ambiguous: Map<string, AmbiguousIcon[]>
}

// The result does not depend on the order of the icons: a name claimed by
// two different icons is never exported. A strict name has an underscore, so
// it never takes the plain name of another icon.
export function buildNameTable(list: IconList): NameTable {
  const groups = groupByExportName(candidates(list))
  const exports = new Map<string, string>()
  const strictClaims = new Map<string, Set<string>>()
  const ambiguousGroups: [string, Candidate[]][] = []
  for (const [name, group] of groups) {
    const [icon, ...others] = iconsOf(group)
    if (icon !== undefined && others.length === 0) exports.set(name, icon)
    else ambiguousGroups.push([name, group])
  }
  for (const [name, group] of ambiguousGroups) {
    for (const candidate of group) {
      const strictName = strictExportName(candidate.name)
      if (strictName === name) continue
      const claims = strictClaims.get(strictName) ?? new Set<string>()
      claims.add(candidate.icon)
      strictClaims.set(strictName, claims)
    }
  }
  for (const [strictName, icons] of strictClaims) {
    const [icon] = icons
    if (icons.size === 1 && icon !== undefined) exports.set(strictName, icon)
  }
  const ambiguous = new Map(
    ambiguousGroups.map(([name, group]) => [
      name,
      group.map(({ name: iconName, icon }) => {
        const strictName = strictExportName(iconName)
        return {
          name: iconName,
          icon,
          strictName: exports.get(strictName) === icon ? strictName : undefined
        }
      })
    ])
  )
  return { exports, ambiguous }
}

// The icon that an import by export name loads, or the error that names what
// the application can import instead.
export function exportedIcon({
  table,
  collection,
  exportName
}: ExportInput): string {
  const lookup = lookupExport({ table, exportName })
  if (lookup.kind === 'icon') return lookup.icon
  const module = `'icon:${collection}'`
  if (lookup.kind === 'ambiguous') {
    const options = lookup.icons.map(icon => choice({ collection, icon }))
    throw new Error(
      `"${exportName}" names more than one icon of ${module}: import ${choices(options)}.`
    )
  }
  const hint =
    lookup.suggestion === undefined ? '' : ` Did you mean ${lookup.suggestion}?`
  throw new Error(`"${exportName}" is not an icon of ${module}.${hint}`)
}
