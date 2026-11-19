import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
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
  const folders = new Set<string>()
  for (const file of featureFiles(options)) {
    if (
      file.endsWith('.json') &&
      path.basename(path.dirname(file)) === 'i18n'
    ) {
      folders.add(path.dirname(file))
    }
    rmSync(path.join(options.stage, file), { force: true })
  }
  for (const folder of folders) {
    const target = path.join(options.stage, folder)
    if (!existsSync(target)) continue
    for (const name of readdirSync(target)) {
      if (name.endsWith('.json')) rmSync(path.join(target, name))
    }
  }
}
