import assert from 'node:assert/strict'
import { it } from 'node:test'

import { createAppFixture } from '../../../testing/createAppFixture/index.ts'
import { iconIgnores } from '../index.ts'

const MANIFEST = JSON.stringify({
  devDependencies: { '@iconify-json/hugeicons': '*' }
})

it('ignores the icon imports and the collections an application has', async context => {
  const root = await createAppFixture({
    context,
    files: {
      'package.json': MANIFEST,
      'src/Topbar.tsx': "import IconGithub from 'icon:hugeicons/github'\n"
    }
  })
  assert.deepEqual(await iconIgnores(root), ['icon', '^@iconify-json/'])
})

it('ignores nothing in an application without icons', async context => {
  const root = await createAppFixture({
    context,
    files: {
      'package.json': '{}\n',
      'src/index.ts': "export const label = 'icon:not-an-import'\n"
    }
  })
  assert.deepEqual(await iconIgnores(root), [])
})

it('finds the re-exports and the dynamic imports of a folder collection', async context => {
  const root = await createAppFixture({
    context,
    files: {
      'package.json': '{}\n',
      'src/icons.ts': "export { Logo } from 'icon:brand'\n",
      'tooling/load.ts': "await import('icon:brand/logo')\n"
    }
  })
  assert.deepEqual(await iconIgnores(root), ['icon'])
})
