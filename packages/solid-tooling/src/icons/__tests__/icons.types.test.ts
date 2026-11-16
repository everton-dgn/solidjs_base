import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { parse } from 'vite-plus'

type Parsed = Awaited<ReturnType<typeof parse>>

type ExportedType = { name: string; source: string | undefined }

const PLUGIN = '@evertondgn/vite-plugin-solid-icons'
const TYPES_ENTRY = `${PLUGIN}/types`
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

async function toolingTypes(): Promise<ExportedType[]> {
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
      const source = member.source?.value
      const declared =
        member.declaration?.type === 'TSTypeAliasDeclaration'
          ? [member.declaration.id.name]
          : []
      return [
        ...declared,
        ...member.specifiers.map(({ exported }) =>
          exported.type === 'Identifier' ? exported.name : exported.value
        )
      ].map(name => ({ name, source }))
    })
  })
}

it('declares every type of the types entry of the icons plugin, from the plugin', async () => {
  const [plugin, tooling] = await Promise.all([
    pluginTypeNames(),
    toolingTypes()
  ])
  assert.ok(plugin.length > 0)
  assert.deepEqual(
    tooling.map(({ name }) => name).toSorted(),
    plugin.toSorted()
  )
  assert.deepEqual([...new Set(tooling.map(({ source }) => source))], [PLUGIN])
})
