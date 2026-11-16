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

it('writes the icon declarations before the lint and the check', () => {
  const icons = {
    'my-images': './src/assets/images/',
    outside: '../shared/icons'
  }
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
