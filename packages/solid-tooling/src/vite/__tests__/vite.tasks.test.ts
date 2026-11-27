import assert from 'node:assert/strict'
import { it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createTasks } from '../tasks.ts'
import { WORKSPACE } from './constants.ts'

// createTasks points at the scripts next to its own module.
const ICONS_SCRIPT = fileURLToPath(
  new URL('../icons-generate.mjs', import.meta.url)
)
const ROOT = '/work/app'

function fromWorkspace(pattern: string) {
  return { pattern, base: 'workspace' }
}

function iconsTask(icons: Record<string, string>) {
  return createTasks({ root: ROOT, icons, isCi: false, hasI18n: false })[
    'icons-generate'
  ]
}

// The pattern of the folder, after the automatic tracking.
function folderPattern(folder: string) {
  const cache = iconsTask({ brand: folder })?.cache
  assert.ok(typeof cache === 'object')
  return cache.input?.[1]
}

it('writes the icon declarations before the lint and the check', () => {
  const icons = { 'my-images': './src/assets/images/' }
  const tasks = createTasks({
    workspace: WORKSPACE,
    root: ROOT,
    icons,
    isCi: false,
    hasI18n: false
  })
  assert.deepEqual(tasks['icons-generate'], {
    command: `node '${ICONS_SCRIPT}' '${JSON.stringify({ root: ROOT, collections: icons })}'`,
    dependsOn: WORKSPACE.dependsOn,
    cache: {
      input: [
        { auto: true },
        'src/assets/images/*.svg',
        'package.json',
        fromWorkspace('bun.lock'),
        fromWorkspace('bunfig.toml'),
        fromWorkspace('packages/tooling/dist/**')
      ],
      output: ['src/icon-collections.d.ts']
    }
  })
  assert.deepEqual(tasks['lint-project']?.dependsOn, [
    'lint-css',
    'icons-generate'
  ])
  assert.deepEqual(tasks['check-project']?.dependsOn, [
    'lint-css',
    'icons-generate'
  ])
})

it('writes the declarations of the installed collections without folders', () => {
  const tasks = createTasks({ root: ROOT, isCi: false, hasI18n: false })
  assert.equal(
    tasks['icons-generate']?.command,
    `node '${ICONS_SCRIPT}' '${JSON.stringify({ root: ROOT, collections: {} })}'`
  )
})

it('tracks a folder that the option gives by its absolute path', () => {
  assert.equal(
    folderPattern(`${ROOT}/src/assets/brand/`),
    'src/assets/brand/*.svg'
  )
})

it('tracks the SVG files of the root folder of the application', () => {
  for (const folder of ['.', './']) {
    assert.equal(folderPattern(folder), '*.svg', folder)
  }
})

it('runs without a cache when a folder sits outside the application', () => {
  for (const folder of ['../shared/icons', '/work/shared/icons', '..']) {
    assert.equal(
      iconsTask({ 'my-images': './src/assets/images', outside: folder })?.cache,
      false,
      folder
    )
  }
})

it('runs without a cache when a pattern would match other files', () => {
  for (const folder of [
    'src/[icons]',
    'src/icons-*',
    'src/(icons)',
    'src/{a,b}',
    String.raw`src\icons`
  ]) {
    assert.equal(iconsTask({ brand: folder })?.cache, false, folder)
  }
})

it('quotes the root and the folders in the command of the shell', () => {
  const root = "/work/it's app"
  const icons = { brand: "./ic'ons" }
  const tasks = createTasks({ root, icons, isCi: false, hasI18n: false })
  const json = JSON.stringify({ root, collections: icons })
  assert.equal(
    tasks['icons-generate']?.command,
    `node '${ICONS_SCRIPT}' '${json.replaceAll("'", String.raw`'\''`)}'`
  )
})

it('tracks root TypeScript imports of the Node configuration', () => {
  const tasks = createTasks({ root: ROOT, isCi: false, hasI18n: false })
  const cache = tasks['typecheck-node']?.cache
  assert.ok(typeof cache === 'object')
  assert.ok(cache.input?.includes('*.ts'))
})
