/* oxlint-disable node/no-sync -- The checks read the manifests of the workspace before any scenario installs. */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import * as v from 'valibot'

const versionsSchema = v.optional(v.record(v.string(), v.string()), {})
const pinnedSchema = v.looseObject({
  catalog: versionsSchema,
  overrides: versionsSchema,
  dependencies: versionsSchema,
  devDependencies: versionsSchema,
  engines: v.optional(v.unknown()),
  devEngines: v.optional(v.unknown()),
  packageManager: v.optional(v.string())
})
const devEnginesSchema = v.object({
  runtime: v.object({ version: v.string() })
})
const nodeEngineSchema = v.object({ node: v.optional(v.string()) })
const publishedSchema = v.object({ engines: v.optional(nodeEngineSchema, {}) })
const PACKAGED_TOOLS = [
  '@playwright/test',
  '@solidjs/vite-plugin',
  'filesystem-routing',
  'knip',
  'nitro',
  '@evertondgn/vite-plugin-solid-icons',
  '@commitlint/cli',
  'lefthook',
  'happy-dom',
  'playwright',
  '@vitest/browser-playwright',
  '@vitest/coverage-v8',
  '@vitest/ui',
  '@testing-library/jest-dom',
  '@types/node',
  'tsrs'
]

type Pinned = v.InferOutput<typeof pinnedSchema>
type CatalogInput = {
  versions: Record<string, string>
  catalog: Pinned['catalog']
}
type Versions = Record<string, string | undefined>
type WorkspaceInput = { root: string; scenarios: string[] }

function resolveCatalog({ versions, catalog }: CatalogInput): Versions {
  return Object.fromEntries(
    Object.entries(versions).map(([name, version]) => [
      name,
      version === 'catalog:' ? catalog[name] : version
    ])
  )
}

export function readPinned(file: string): Pinned {
  return v.parse(pinnedSchema, JSON.parse(readFileSync(file, 'utf8')))
}

// The applications sit outside the workspace, where catalog: does not
// resolve, so they pin each version. Without this check an update of the
// workspace would leave the matrix testing the old versions.
export function checkApplicationVersions({
  root,
  scenarios
}: WorkspaceInput): void {
  const workspace = readPinned(path.join(root, 'package.json'))
  const copy = readPinned(path.join(root, 'apps/boilerplate/package.json'))
  const { catalog } = workspace
  // The packaged tsrs must be the copy that runs the type-aware lint, so the
  // application installs a single compiler.
  const vitePlus = readPinned(
    path.join(root, 'node_modules/vite-plus/package.json')
  )
  assert.equal(
    vitePlus.dependencies.tsrs,
    `=${catalog.tsrs}`,
    'the catalog must pin the tsrs that vite-plus depends on'
  )
  assert.ok(!copy.dependencies['@evertondgn/solid-tooling'])
  assert.ok(copy.devDependencies['@evertondgn/solid-tooling'])
  // Without engines.node in the copy, Nitro writes the Vercel function on Bun.
  assert.deepEqual(copy.engines, workspace.engines, 'apps/boilerplate')
  assert.deepEqual(copy.devEngines, workspace.devEngines, 'apps/boilerplate')
  const tooling = readPinned(
    path.join(root, 'packages/solid-tooling/package.json')
  )
  const runtime = readPinned(
    path.join(root, 'packages/solid-runtime/package.json')
  )
  for (const name of PACKAGED_TOOLS) {
    assert.ok(tooling.dependencies[name], `${name} must ship with the tooling`)
  }
  const expected = resolveCatalog({
    versions: { ...catalog, ...copy.dependencies, ...copy.devDependencies },
    catalog
  })
  for (const [name, version] of Object.entries(
    resolveCatalog({ versions: runtime.dependencies, catalog })
  )) {
    assert.equal(
      version,
      expected[name] ?? tooling.dependencies[name],
      `runtime dependency: ${name}`
    )
  }
  const overrides = resolveCatalog({ versions: workspace.overrides, catalog })
  for (const scenario of scenarios) {
    const app = readPinned(
      path.join(root, 'fixtures/apps', scenario, 'package.json')
    )
    for (const [name, version] of Object.entries(app.dependencies)) {
      assert.equal(version, expected[name], `${scenario}: ${name}`)
      assert.ok(
        !PACKAGED_TOOLS.includes(name),
        `${scenario} must use the packaged ${name}`
      )
    }
    assert.deepEqual(app.overrides, overrides, scenario)
    assert.deepEqual(app.engines, workspace.engines, scenario)
    assert.deepEqual(app.devEngines, workspace.devEngines, scenario)
    assert.equal(app.packageManager, workspace.packageManager, scenario)
  }
}

// Every folder of packages/ is published, and the packages are tested only on
// the Node version that devEngines pins, so each declares it as its minimum.
export function checkPackageEngines(root: string): void {
  const workspace = readPinned(path.join(root, 'package.json'))
  const { runtime } = v.parse(devEnginesSchema, workspace.devEngines)
  const expected = `>=${runtime.version}`
  const files = readdirSync(path.join(root, 'packages'))
    .map(name => path.join('packages', name, 'package.json'))
    .filter(file => existsSync(path.join(root, file)))
  assert.ok(files.length > 0, 'no package found in packages/')
  for (const file of files) {
    const text = readFileSync(path.join(root, file), 'utf8')
    const manifest = v.parse(publishedSchema, JSON.parse(text))
    const message = `${file}: set engines.node to "${expected}", the devEngines.runtime version of the root package.json`
    assert.equal(manifest.engines.node, expected, message)
  }
}
