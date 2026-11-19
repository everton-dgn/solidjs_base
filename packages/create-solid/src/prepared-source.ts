import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { parse, record, string } from 'valibot'

import { guideDigest } from './prepared-guides.ts'

type SourceKey = { text: string; isLocalized: boolean }

export function plainSourceFiles(stage: string): string[] {
  return readdirSync(stage, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && /\.(?:tsx?|json)$/u.test(entry.name))
    .map(entry => path.join(entry.parentPath, entry.name))
    .filter(file => !file.endsWith('/constants/messages/index.ts'))
}

export function preparedSourceKey({ text, isLocalized }: SourceKey): string {
  const digest = guideDigest(text)
  return isLocalized ? `localized-${digest}` : digest
}

export type SourceSelection = { stage: string; files?: string[] }

export function applyPreparedSource({ stage, files }: SourceSelection): void {
  const source = new URL('../dist/prepared-source.json', import.meta.url)
  const table = parse(
    record(string(), string()),
    JSON.parse(readFileSync(source, 'utf8'))
  )
  for (const file of new Set(files ?? plainSourceFiles(stage))) {
    const original = readFileSync(file, 'utf8')
    const formatted =
      table[
        preparedSourceKey({ text: original, isLocalized: files !== undefined })
      ]
    if (files && formatted === undefined) {
      throw new Error(
        `Missing prepared source for ${path.relative(stage, file)}`
      )
    }
    if (formatted !== undefined && formatted !== original) {
      writeFileSync(file, formatted)
    }
  }
}
