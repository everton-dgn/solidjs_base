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

it('finds a re-export of a folder collection', async context => {
  const root = await createAppFixture({
    context,
    files: {
      'package.json': '{}\n',
      'src/icons.ts': "export { Logo } from 'icon:brand'\n"
    }
  })
  assert.deepEqual(await iconIgnores(root), ['icon'])
})

it('finds a dynamic import of an icon', async context => {
  const root = await createAppFixture({
    context,
    files: {
      'package.json': '{}\n',
      'tooling/load.ts': "await import('icon:brand/logo')\n"
    }
  })
  assert.deepEqual(await iconIgnores(root), ['icon'])
})

it('ignores the text of an import in a comment or a string', async context => {
  const root = await createAppFixture({
    context,
    files: {
      'package.json': '{}\n',
      'src/note.ts': [
        "// Example: import IconMark from 'icon:scenario/mark'",
        '/* await import("icon:scenario/mark") */',
        `export const example = "import IconMark from 'icon:scenario/mark'"`,
        ''
      ].join('\n')
    }
  })
  assert.deepEqual(await iconIgnores(root), [])
})

it('ignores the collections of the production dependencies', async context => {
  const root = await createAppFixture({
    context,
    files: {
      'package.json': JSON.stringify({
        dependencies: { '@iconify-json/hugeicons': '*' }
      })
    }
  })
  assert.deepEqual(await iconIgnores(root), ['^@iconify-json/'])
})
