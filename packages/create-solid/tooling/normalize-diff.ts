import { readFileSync } from 'node:fs'
import path from 'node:path'

import { parse } from 'valibot'

import { settingsSchema } from '../src/schema.ts'

type PackedDiff = { directory: string; diff: string }
type PackageVersions = { version: string; versions: Record<string, string> }

export function normalizeDiff(diff: string, settings: PackageVersions): string {
  const { version } = settings
  return diff
    .split('\n')
    .filter(line => !line.startsWith('index '))
    .map(line => {
      if (!line.startsWith('+')) return line
      let normalized = line.replaceAll(
        `/create-solid@${version}/`,
        '/create-solid@{version}/'
      )
      for (const [name, pinned] of Object.entries(settings.versions)) {
        normalized = normalized.replace(
          `"${name}": "${pinned}"`,
          `"${name}": "{version}"`
        )
      }
      return normalized
    })
    .join('\n')
}

export function normalizePackedDiff({ directory, diff }: PackedDiff): string {
  const file = path.join(directory, 'dist/settings.json')
  const settings = parse(settingsSchema, JSON.parse(readFileSync(file, 'utf8')))
  return normalizeDiff(diff, settings)
}
