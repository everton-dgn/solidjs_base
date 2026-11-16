import assert from 'node:assert/strict'
import { it } from 'node:test'

import { createAppFixture } from '../../../testing/createAppFixture/index.ts'
import { iconIgnores } from '../index.ts'

const MANIFEST = JSON.stringify({
  devDependencies: { '@iconify-json/hugeicons': '*' }
})
const PLUGIN = '@evertondgn/vite-plugin-solid-icons'
const TYPES_ENTRY = `${PLUGIN}/types`

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

it('finds a dynamic import of an icon written as a template', async context => {
  const root = await createAppFixture({
    context,
    files: {
      'package.json': '{}\n',
      'src/load.ts': 'await import(`icon:brand/logo`)\n'
    }
  })
  assert.deepEqual(await iconIgnores(root), ['icon'])
})

it('adds no ignore for an icon path that the code builds, which Knip does not read', async context => {
  const root = await createAppFixture({
    context,
    files: {
      'package.json': '{}\n',
      'src/load.ts': [
        `export const load = (name: string) => import(\`icon:brand/\${name}\`)`,
        "export const loadMark = (name: string) => import('icon:mark/' + name)",
        ''
      ].join('\n')
    }
  })
  assert.deepEqual(await iconIgnores(root), [])
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

it('ignores the icons plugin when a file imports its types entry without the plugin', async context => {
  const root = await createAppFixture({
    context,
    files: {
      'package.json': '{}\n',
      'src/app-icon.ts': `import type { IconComponent } from '${TYPES_ENTRY}'\nexport type AppIcon = IconComponent\n`
    }
  })
  assert.deepEqual(await iconIgnores(root), [PLUGIN])
})

it('finds a re-export of the types entry', async context => {
  const root = await createAppFixture({
    context,
    files: {
      'package.json': '{}\n',
      'tooling/icons.ts': `export type { IconComponent } from '${TYPES_ENTRY}'\n`
    }
  })
  assert.deepEqual(await iconIgnores(root), [PLUGIN])
})

it('finds the icon imports and the types entry in different files', async context => {
  const root = await createAppFixture({
    context,
    files: {
      'package.json': '{}\n',
      'src/a.ts': `import type { IconComponent } from '${TYPES_ENTRY}'\nexport type AppIcon = IconComponent\n`,
      'src/b.ts': "export { default as Logo } from 'icon:brand/logo'\n",
      'src/c.ts': `export type { IconComponent } from '${TYPES_ENTRY}'\n`,
      'src/d.ts': "export { default as Mark } from 'icon:brand/mark'\n"
    }
  })
  assert.deepEqual(await iconIgnores(root), ['icon', PLUGIN])
})

it('keeps the icons plugin visible to Knip when the application declares it', async context => {
  const root = await createAppFixture({
    context,
    files: {
      'package.json': JSON.stringify({ devDependencies: { [PLUGIN]: '*' } }),
      'src/app-icon.ts': `import type { IconComponent } from '${TYPES_ENTRY}'\nexport type AppIcon = IconComponent\n`
    }
  })
  assert.deepEqual(await iconIgnores(root), [])
})

it('does not ignore the icons plugin without an import of its types entry', async context => {
  const root = await createAppFixture({
    context,
    files: {
      'package.json': '{}\n',
      'src/note.ts': `// The types come from ${TYPES_ENTRY}.\nexport const entry = '${TYPES_ENTRY}'\n`,
      'src/icon-collections.d.ts': [
        "declare module 'icon:brand' {",
        `  import type { IconComponent } from '${TYPES_ENTRY}'`,
        '',
        '  export const Logo: IconComponent',
        '}',
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
