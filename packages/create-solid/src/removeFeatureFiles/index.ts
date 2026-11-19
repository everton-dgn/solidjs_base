import { readFileSync, rmSync } from 'node:fs'
import path from 'node:path'

import { array, object, parse, record, string, union } from 'valibot'

import { distribution } from '../paths.ts'

const owners = union([string(), array(string())])
const schema = object({
  serverOnly: array(string()),
  clientExcludes: array(string()),
  files: record(string(), owners)
})
function readInventory() {
  const source = new URL('features.json', distribution)
  return parse(schema, JSON.parse(readFileSync(source, 'utf8')))
}
let inventory: ReturnType<typeof readInventory> | undefined
type FileSelection = {
  stage: string
  disabled: string[]
  group?: 'serverOnly' | 'clientExcludes'
}
export function featureFiles({
  disabled,
  group
}: Omit<FileSelection, 'stage'>): Set<string> {
  inventory ??= readInventory()
  const paths = new Set(group ? inventory[group] : [])
  for (const [file, owner] of Object.entries(inventory.files)) {
    const features = typeof owner === 'string' ? [owner] : owner
    if (features.some(feature => disabled.includes(feature))) paths.add(file)
  }
  return paths
}

export function removeFeatureFiles(options: FileSelection): void {
  for (const file of featureFiles(options)) {
    rmSync(path.join(options.stage, file), { force: true })
  }
}
