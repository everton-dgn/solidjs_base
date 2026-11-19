import { readFileSync, rmSync } from 'node:fs'
import path from 'node:path'

import { array, object, parse, string } from 'valibot'

export function removeModeFiles(
  stage: string,
  group: 'clientExcludes' | 'serverOnly'
): void {
  const source = new URL('../dist/features.json', import.meta.url)
  const files = array(string())
  const inventory = parse(
    object({ serverOnly: files, clientExcludes: files }),
    JSON.parse(readFileSync(source, 'utf8'))
  )
  for (const file of inventory[group]) {
    rmSync(path.join(stage, file), { force: true })
  }
}
