import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { parse } from 'vite-plus'

type Parsed = Awaited<ReturnType<typeof parse>>

const TYPES_ENTRY = '@evertondgn/vite-plugin-solid-icons/types'
const ICON_MODULES = path.resolve(
  import.meta.dirname,
  '../../../icon-modules.d.ts'
)

async function parseFile(file: string): Promise<Parsed> {
  return parse(file, await readFile(file, 'utf8'))
}

// TypeScript reads the declarations of an entry from the .d.mts beside it.
async function pluginTypeNames(): Promise<string[]> {
  const entry = fileURLToPath(import.meta.resolve(TYPES_ENTRY))
  const { module } = await parseFile(entry.replace(/\.mjs$/u, '.d.mts'))
  return module.staticExports.flatMap(({ entries }) =>
    entries.flatMap(({ exportName }) =>
      exportName.name === null ? [] : [exportName.name]
    )
  )
}

async function toolingTypeNames(): Promise<string[]> {
  const { program } = await parseFile(ICON_MODULES)
  return program.body.flatMap(statement => {
    if (
      statement.type !== 'TSModuleDeclaration' ||
      statement.id.type !== 'Literal' ||
      statement.id.value !== TYPES_ENTRY ||
      statement.body?.type !== 'TSModuleBlock'
    ) {
      return []
    }
    return statement.body.body.flatMap(member => {
      if (member.type !== 'ExportNamedDeclaration') return []
      const declared =
        member.declaration?.type === 'TSTypeAliasDeclaration'
          ? [member.declaration.id.name]
          : []
      return [
        ...declared,
        ...member.specifiers.map(({ exported }) =>
          exported.type === 'Identifier' ? exported.name : exported.value
        )
      ]
    })
  })
}

it('declares every type of the types entry of the icons plugin', async () => {
  const [plugin, tooling] = await Promise.all([
    pluginTypeNames(),
    toolingTypeNames()
  ])
  assert.ok(plugin.length > 0)
  assert.deepEqual(tooling.toSorted(), plugin.toSorted())
})
