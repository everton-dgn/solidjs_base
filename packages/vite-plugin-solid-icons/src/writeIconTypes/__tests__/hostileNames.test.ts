import assert from 'node:assert/strict'
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, type TestContext } from 'node:test'

import { build, parse } from 'vite-plus'

import { buildNameTable } from '../../iconNames/index.ts'
import { writeIconTypes } from '../index.ts'

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../../..')
const SVG = '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>'
const BODY = { body: '<path d="M0 0h24v24H0z"/>' }
// Names that would close the comment, open a string or a template, break
// the line or reach the prototype if the generator wrote them as they are.
const HOSTILE_NAMES = [
  '*/ declare const evil: 1 /*',
  "q'uote",
  'q"uote',
  'back`tick',
  ['$', '{evil}'].join(''),
  'new\nline',
  'sp ace',
  'a:b',
  'ícone',
  '-',
  '_'
]
const KEYWORDS = ['class', 'default', 'delete', 'constructor', '__proto__']

async function workspace(context: TestContext): Promise<string> {
  const prefix = path.join(tmpdir(), 'solid-icons-names-')
  const root = await realpath(await mkdtemp(prefix))
  context.after(() => rm(root, { recursive: true, force: true }))
  const collection = path.join(root, 'node_modules/@iconify-json/hostile')
  await mkdir(collection, { recursive: true })
  await mkdir(path.join(root, 'icons'))
  const icons = Object.fromEntries(
    [...HOSTILE_NAMES, ...KEYWORDS, 'star', 'Star'].map(name => [name, BODY])
  )
  await writeFile(
    path.join(collection, 'icons.json'),
    JSON.stringify({
      prefix: 'hostile',
      icons,
      // fromEntries makes __proto__ a key, as JSON.parse does.
      aliases: Object.fromEntries([
        ['__proto__', { parent: 'star' }],
        ['*/x', { parent: 'star' }]
      ])
    })
  )
  await writeFile(
    path.join(collection, 'package.json'),
    JSON.stringify({ name: '@iconify-json/hostile', version: '0.0.0' })
  )
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ devDependencies: { '@iconify-json/hostile': '*' } })
  )
  // A file name cannot have a slash; the backslash closes no comment, but
  // a generator that split on it would.
  for (const name of [...HOSTILE_NAMES, ...KEYWORDS, 'star', 'Star']) {
    const file = `${name.replaceAll('/', '\\')}.svg`
    await writeFile(path.join(root, 'icons', file), SVG)
  }
  return root
}

async function isCaseSensitive(folder: string): Promise<boolean> {
  const files = await readdir(folder)
  return files.includes('star.svg') && files.includes('Star.svg')
}

describe('the names of hostile files and icons', () => {
  it('keeps the declarations valid TypeScript', async context => {
    const root = await workspace(context)
    const { file } = await writeIconTypes({
      root,
      collections: { own: './icons' }
    })
    const types = await readFile(file, 'utf8')
    const { errors } = await parse('icon-collections.d.ts', types, {
      lang: 'ts'
    })

    assert.deepEqual(errors, [])
    const own = types.slice(types.indexOf("declare module 'icon:own' {"))
    const installed = types.slice(
      0,
      types.indexOf("declare module 'icon:own' {")
    )
    for (const name of ['Class', 'Default', 'Delete', 'Constructor', 'Proto']) {
      assert.match(own, new RegExp(`export const ${name}: IconComponent`, 'u'))
    }
    assert.doesNotMatch(types, /evil|uote|tick|ícone|sp ace|a:b|\*\/x/u)
    // The icon __proto__ and the alias __proto__ of star both claim Proto,
    // so the alias is kept as a name and not lost to the prototype.
    assert.doesNotMatch(installed, /export const Proto: /u)
    assert.match(installed, /export const Class: IconComponent/u)
  })

  it('exports neither of two names that differ only in case', async context => {
    const root = await workspace(context)
    const table = buildNameTable({ icons: ['Star', 'star'], aliases: {} })
    const { file } = await writeIconTypes({
      root,
      collections: { own: './icons' }
    })
    const types = await readFile(file, 'utf8')
    const own = types.slice(types.indexOf("declare module 'icon:own' {"))

    assert.equal(table.exports.has('Star'), false)
    assert.deepEqual(
      table.ambiguous.get('Star')?.map(icon => icon.name),
      ['Star', 'star']
    )
    // A file system that ignores case keeps one of the two files.
    assert.equal(
      /export const Star: /u.test(own),
      !(await isCaseSensitive(path.join(root, 'icons')))
    )
  })

  it('rewrites the imports of names that are keywords', async context => {
    const root = await workspace(context)
    await symlink(
      path.join(PACKAGE_ROOT, 'node_modules/@solidjs'),
      path.join(root, 'node_modules/@solidjs')
    )
    await writeFile(
      path.join(root, 'entry.js'),
      `import { Class, Default, Delete, "Constructor" as Make } from 'icon:own'\nexport { Class as "a name" } from 'icon:hostile'\nconsole.log(Class, Default, Delete, Make)\n`
    )
    const { solidIcons } = await import('../../index.ts')
    const { default: solid } = await import('@solidjs/vite-plugin')

    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        solidIcons({ collections: { own: './icons' }, typesFile: false }),
        solid()
      ],
      build: {
        write: false,
        rolldownOptions: { input: path.join(root, 'entry.js') }
      }
    })
    await assert.rejects(access(path.join(root, 'src/icon-collections.d.ts')))
  })
})
