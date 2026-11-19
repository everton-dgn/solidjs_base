import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { parse, record, string } from 'valibot'

import { guideDigest } from './prepared-guides.ts'

export function plainSourceFiles(stage: string): string[] {
  return readdirSync(stage, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && /\.(?:tsx?|json)$/u.test(entry.name))
    .map(entry => path.join(entry.parentPath, entry.name))
    .filter(file => !file.endsWith('/constants/messages/index.ts'))
}
export function applyPreparedSource(
  stage: string,
  files = plainSourceFiles(stage)
): void {
  const source = new URL('../dist/prepared-source.json', import.meta.url)
  const table = parse(
    record(string(), string()),
    JSON.parse(readFileSync(source, 'utf8'))
  )
  for (const file of files) {
    const original = readFileSync(file, 'utf8')
    const formatted = table[guideDigest(original)]
    if (formatted !== undefined) writeFileSync(file, formatted)
  }
}
