import assert from 'node:assert/strict'
import { it } from 'node:test'

import { removeCatalogTasks } from '../src/configurePlainApp/package.ts'

void it('removes catalog compilation and keeps the commands that follow it', () => {
  const pkg = {
    name: 'app',
    scripts: {
      'i18n:generate': 'vp run i18n-generate',
      'check:ci': 'vp run i18n:generate && vp run check-project',
      test: 'vp run i18n:generate && vp test run',
      dev: 'vp dev'
    },
    dependencies: { 'solid-js': 'workspace:*' },
    devDependencies: { '@inlang/paraglide-js': 'workspace:*' }
  }
  removeCatalogTasks(pkg)
  assert.deepEqual(pkg.scripts, {
    'check:ci': 'vp run check-project',
    test: 'vp test run',
    dev: 'vp dev'
  })
  assert.deepEqual(pkg.devDependencies, {})
  assert.deepEqual(pkg.dependencies, { 'solid-js': 'workspace:*' })
  assert.throws(() => removeCatalogTasks(pkg), /Missing i18n:generate/u)
})
