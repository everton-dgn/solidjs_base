import assert from 'node:assert/strict'
import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it, type TestContext } from 'node:test'

import { build } from 'vite-plus'

import { solidIcons } from '../index.ts'
import { createFixtureApp, fixtureConfig } from './fixture-app.ts'

type BuildInput = { context: TestContext; source: string }

// Builds an entry that only imports the module, so the error comes from this
// plugin and not from the Solid compiler.
async function buildImport({ context, source }: BuildInput): Promise<void> {
  const root = await createFixtureApp()
  context.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(
    path.join(root, 'entry.js'),
    `import ${JSON.stringify(source)}\n`
  )
  await build({
    ...fixtureConfig({ root, isSsr: false }),
    logLevel: 'silent',
    build: {
      write: false,
      rolldownOptions: { input: path.join(root, 'entry.js') }
    }
  })
}

describe('solidIcons', () => {
  it('refuses collection names that an import cannot spell', () => {
    assert.throws(
      () =>
        solidIcons({
          collections: { Brand: './brand', ok: './ok', my_icons: './x' }
        }),
      {
        message:
          'solidIcons: the collection names "Brand", "my_icons" must use lowercase letters, digits and single hyphens.'
      }
    )
  })

  it('names the missing icon in the build error', async context => {
    await assert.rejects(
      buildImport({ context, source: 'icon:hugeicons/no-such-icon' }),
      /Icon "hugeicons\/no-such-icon" not found in @iconify-json\/hugeicons\./u
    )
  })

  it('names the missing collection in the build error', async context => {
    await assert.rejects(
      buildImport({ context, source: 'icon:not-installed/github' }),
      /Icon collection "not-installed" not found: install @iconify-json\/not-installed/u
    )
  })

  it('refuses the import of a whole collection for now', async context => {
    await assert.rejects(
      buildImport({ context, source: 'icon:hugeicons' }),
      /Named imports from "icon:hugeicons" are not available yet/u
    )
  })
})
