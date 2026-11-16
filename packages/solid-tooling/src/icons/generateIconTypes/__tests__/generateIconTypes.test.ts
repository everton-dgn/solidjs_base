import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { execPath } from 'node:process'
import { it } from 'node:test'
import { promisify } from 'node:util'

import { createAppFixture } from '../../../testing/createAppFixture/index.ts'

const SCRIPT = path.resolve(
  import.meta.dirname,
  '../../../../dist/icons-generate.mjs'
)
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>\n'
const exec = promisify(execFile)

// The task runs the packaged script, as the command of icons-generate does.
function generate(options: Record<string, unknown>) {
  return exec(execPath, [SCRIPT, JSON.stringify(options)])
}

it('writes the declarations of the folder collections at the root', async context => {
  const root = await createAppFixture({
    context,
    files: { 'package.json': '{}\n', 'src/assets/brand/logo-mark.svg': SVG }
  })

  await generate({ root, collections: { brand: './src/assets/brand' } })

  const declarations = await readFile(
    path.join(root, 'src/icon-collections.d.ts'),
    'utf8'
  )
  assert.match(declarations, /declare module 'icon:brand' \{/u)
  assert.match(declarations, /export const LogoMark: IconComponent/u)
})

it('stops when a collection of the package.json cannot be read', async context => {
  const root = await createAppFixture({
    context,
    files: {
      'package.json': JSON.stringify({
        devDependencies: { '@iconify-json/not-installed': '*' }
      })
    }
  })

  await assert.rejects(generate({ root, collections: {} }), {
    stderr: /The icon declarations leave out the collection "not-installed"/u
  })
})

it('refuses a command without the options', async () => {
  await assert.rejects(exec(execPath, [SCRIPT]), {
    stderr: /icons-generate takes the root and the icon collections/u
  })
})
