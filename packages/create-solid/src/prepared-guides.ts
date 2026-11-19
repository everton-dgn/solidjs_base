import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { parse, record, string } from 'valibot'

export function guideFiles(stage: string): string[] {
  const docs = readdirSync(path.join(stage, 'docs'), {
    recursive: true,
    encoding: 'utf8'
  })
  return [
    'README.md',
    ...docs
      .filter(file => file.endsWith('.md'))
      .map(file => path.join('docs', file))
  ]
}

export function guideDigest(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export function applyPreparedGuides(stage: string): void {
  const source = new URL('../dist/prepared-guides.json', import.meta.url)
  const guides = parse(
    record(string(), string()),
    JSON.parse(readFileSync(source, 'utf8'))
  )
  for (const file of guideFiles(stage)) {
    const target = path.join(stage, file)
    const content = readFileSync(target, 'utf8')
    const key = guideDigest(content)
    const prepared = guides[key]
    if (prepared === undefined) {
      throw new Error(`Unprepared guide: ${file} (${key})`)
    }
    writeFileSync(target, prepared)
  }
}
