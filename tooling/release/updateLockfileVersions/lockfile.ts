import { lstat, readFile } from 'node:fs/promises'

import type { WorkspacesSection } from './types.ts'

type LineQuery = { lines: readonly string[]; index: number }

// WHY: the generated lock arrives as an artifact of another job. The lock of
// this repository has a few hundred kilobytes, so a larger file is not one
// and is refused before it is read into memory. 16 MiB.
const MAX_BYTES = 16_777_216
// Bun writes the lock with two spaces per level: the workspaces section at
// the first level, one entry per folder at the second and the fields of the
// entry at the third. A dependency named "version" sits one level deeper.
const WORKSPACES = '  "workspaces": {'
const SECTION_END = '  },'
const ENTRY = /^ {4}(?<name>"(?:[^"\\]|\\.)*"): \{$/u
const ENTRY_END = '    },'
const VERSION =
  /^ {6}"version": "(?<version>\d+\.\d+\.\d+(?:-[\dA-Za-z.-]+)?(?:\+[\dA-Za-z.-]+)?)",$/u
// WHY: with invalid bytes, two different files decode to the same text, and
// the text is what the lines are compared by. The BOM stays in the text, so a
// generated lock that adds one differs on its first line.
const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

function readEntryName(line: string): string | undefined {
  const name = ENTRY.exec(line)?.groups?.name
  if (name === undefined) return undefined
  try {
    const value: unknown = JSON.parse(name)
    return typeof value === 'string' ? value : undefined
  } catch {
    return undefined
  }
}

export async function readGeneratedLock(file: string): Promise<string> {
  const stats = await lstat(file)
  if (!stats.isFile()) {
    throw new Error(
      `${file} is not a regular file, so it is not read as a lockfile. Nothing was written.`
    )
  }
  if (stats.size > MAX_BYTES) {
    throw new Error(
      `${file} has ${stats.size} bytes, more than the ${MAX_BYTES} a lockfile of this repository can have. Nothing was written.`
    )
  }
  try {
    return UTF8.decode(await readFile(file))
  } catch (error) {
    throw new Error(`${file} is not UTF-8 text. Nothing was written.`, {
      cause: error
    })
  }
}

export function findWorkspacesSection(
  lines: readonly string[]
): WorkspacesSection | undefined {
  const start = lines.indexOf(WORKSPACES)
  if (start === -1) return undefined
  const end = lines.indexOf(SECTION_END, start + 1)
  return end === -1 ? undefined : { start, end }
}

// The entry whose fields hold the line: the nearest entry name above it,
// unless an entry closes first.
export function findWorkspace({ lines, index }: LineQuery): string | undefined {
  for (let above = index - 1; above >= 0; above -= 1) {
    const line = lines[above] ?? ''
    if (line === ENTRY_END) return undefined
    const name = readEntryName(line)
    if (name !== undefined) return name
  }
  return undefined
}

export function readVersion(line: string): string | undefined {
  return VERSION.exec(line)?.groups?.version
}
