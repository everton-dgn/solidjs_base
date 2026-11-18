import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { doctor } from '../index.ts'

type FixtureFile = { file: string; value: string }

async function write({ file, value }: FixtureFile) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, value)
}
test('resolves each application and its peers from their declaring manifests', async t => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'solid-doctor-'))
  const workspace = await realpath(temporary)
  t.after(() => rm(workspace, { recursive: true, force: true }))
  await writeFile(path.join(workspace, 'bun.lock'), '')
  const tooling = '@evertondgn/solid-tooling'
  for (const version of ['1.0.0', '2.0.0']) {
    const root = path.join(workspace, 'apps', version)
    const modules = path.join(root, 'node_modules')
    const file = path.join(root, 'package.json')
    await write({
      file,
      value: JSON.stringify({
        name: 'app',
        dependencies: {
          [tooling]: version,
          'missing-example': '1',
          'solid-js': '2'
        }
      })
    })
    const source = path.join(modules, tooling, 'package.json')
    await write({
      file: source,
      value: JSON.stringify({
        name: tooling,
        version,
        peerDependencies: { '@solidjs/web': '1.0.0', optional: '1' },
        peerDependenciesMeta: { optional: { optional: true } }
      })
    })
    for (const [name, installed] of Object.entries({
      'solid-js': '2.0.0',
      '@solidjs/web': '3.0.0'
    })) {
      await write({
        file: path.join(modules, name, 'package.json'),
        value: JSON.stringify({ name, version: installed })
      })
    }
    const report = await doctor({ root })
    assert.equal(report.workspaceRoot, workspace)
    assert.equal(
      report.packages.find(item => item.package === tooling)?.version,
      version
    )
    assert.ok(
      report.checks.some(
        item =>
          item.id === 'dependency-unresolved' &&
          item.file === file &&
          item.package === 'missing-example'
      )
    )
    assert.ok(
      report.checks.some(
        item =>
          item.id === 'peer-version' &&
          item.source === source &&
          item.status === 'error'
      )
    )
    assert.ok(
      report.checks.some(
        item =>
          item.id === 'solid-family-version' &&
          item.status === 'error' &&
          item.file === path.join(workspace, 'package.json')
      )
    )
    assert.ok(
      report.checks.some(
        item =>
          item.id === 'skill-present' &&
          item.package === tooling &&
          item.status === 'error'
      )
    )
    assert.ok(
      report.checks.some(
        item => item.id === 'agents-block' && item.status === 'warning'
      )
    )
    assert.ok(report.checks.every(item => item.package !== 'optional'))
    assert.deepEqual(report.skills, [])
    assert.ok(report.checks.every(item => item.id !== 'icon-collection'))
  }
})
test('classifies optional features from the preset and application files', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'solid-features-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await write({
    file: path.join(root, 'package.json'),
    value: '{"name":"app"}'
  })
  await write({
    file: path.join(root, 'project.inlang/settings.json'),
    value: '{}'
  })
  await write({
    file: path.join(root, 'src/icon.ts'),
    value:
      "import { Logo } from 'icon:brand'\nimport { Moon } from 'icon:solar'"
  })
  const preset = {
    folders: ['brand'],
    tasks: ['check-project'],
    isI18nDisabled: true
  }
  const report = await doctor({ root, preset })
  const warnings = report.checks.filter(item => item.id === 'icon-collection')
  assert.deepEqual(
    warnings.map(item => item.package),
    ['@iconify-json/solar']
  )
  assert.ok(report.checks.every(item => item.id !== 'i18n-dependency'))
  const unknown = await doctor({ root })
  assert.ok(unknown.checks.every(item => item.id !== 'icon-collection'))
  assert.ok(
    unknown.checks.some(
      item => item.id === 'i18n-dependency' && item.status === 'warning'
    )
  )
  await write({
    file: path.join(root, 'vite.config.ts'),
    value: 'export default defineSolidApp({i18nPlugin:false})'
  })
  const disabled = await doctor({ root })
  assert.ok(disabled.checks.every(item => item.id !== 'i18n-dependency'))
})
