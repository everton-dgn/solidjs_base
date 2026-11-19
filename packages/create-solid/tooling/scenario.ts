import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'

import { parse } from 'valibot'

import { manifestSchema } from '../src/schema.ts'

const jsonIndent = 2
const seconds = 1000
const cliOffset = 2
const packTimeout = 60_000
const sandbox = mkdtempSync(path.join(tmpdir(), 'full-solid-'))
const packages = [
  'solid-runtime',
  'solid-tooling',
  'vite-plugin-solid-icons',
  'create-solid'
]
try {
  const archives: Record<string, string> = {}
  for (const name of packages) {
    const output = path.join(sandbox, name)
    mkdirSync(output)
    execFileSync('vp', ['pm', 'pack', '--pack-destination', output], {
      cwd: path.join(import.meta.dirname, '../..', name),
      timeout: packTimeout
    })
    const [archive] = readdirSync(output)
    assert.ok(archive)
    archives[name] = path.join(output, archive)
  }
  assert.ok(archives['create-solid'])
  execFileSync('tar', ['xf', archives['create-solid']], { cwd: sandbox })
  const scenarios = [
    ...['bun', 'pnpm', 'npm'].map(pm => ({
      name: pm,
      pm,
      flags: [] as string[]
    })),
    { name: 'static-with-seo', pm: 'bun', flags: ['--mode', 'static'] },
    {
      name: 'server-without-ui-features',
      pm: 'npm',
      flags: ['--no-theme', '--no-fonts', '--no-icons']
    }
  ]
  const [selected] = process.argv.slice(cliOffset)
  if (selected && !scenarios.some(item => item.name === selected)) {
    throw new Error(`Unknown scenario: ${selected}`)
  }
  for (const { name, pm, flags } of scenarios.filter(
    item => !selected || item.name === selected
  )) {
    const start = performance.now()
    const cwd = path.join(sandbox, name)
    execFileSync(
      process.execPath,
      [
        path.join(sandbox, 'package/dist/create-solid.mjs'),
        cwd,
        '--pm',
        pm,
        '--no-install',
        ...flags
      ],
      { stdio: 'inherit' }
    )
    const file = path.join(cwd, 'package.json')
    const manifest = parse(
      manifestSchema,
      JSON.parse(readFileSync(file, 'utf8'))
    )
    manifest.dependencies['@evertondgn/solid-runtime'] =
      `file:${archives['solid-runtime']}`
    manifest.devDependencies['@evertondgn/solid-tooling'] =
      `file:${archives['solid-tooling']}`
    const icons = `file:${archives['vite-plugin-solid-icons']}`
    if (pm === 'pnpm') {
      const yaml = path.join(cwd, 'pnpm-workspace.yaml')
      writeFileSync(
        yaml,
        readFileSync(yaml, 'utf8').replace(
          'overrides:',
          `overrides:\n  '@evertondgn/vite-plugin-solid-icons': '${icons}'`
        )
      )
    } else {
      assert.ok(manifest.overrides)
      manifest.overrides['@evertondgn/vite-plugin-solid-icons'] = icons
    }
    writeFileSync(file, `${JSON.stringify(manifest, null, jsonIndent)}\n`)
    execFileSync(pm, ['install'], { cwd, stdio: 'inherit', timeout: 120_000 })
    if (pm === 'pnpm') {
      execFileSync('vp', ['fmt', 'pnpm-workspace.yaml'], { cwd })
    }
    execFileSync(
      process.execPath,
      ['--test', 'tooling/__tests__/patched-dependencies.test.ts'],
      { cwd, stdio: 'inherit', timeout: 30_000 }
    )
    const tasks = ['check:ci', 'build']
    if (pm === 'bun' || flags.length > 0) tasks.splice(1, 0, 'test')
    if (pm === 'bun' && flags.length === 0) {
      tasks.push('typecheck:node', 'test:tooling', 'dead-code')
    }
    for (const task of tasks) {
      execFileSync('vp', ['run', task], {
        cwd,
        stdio: 'inherit',
        timeout: 180_000
      })
    }
    if (flags.length > 0) {
      execFileSync(
        'vp',
        ['run', 'playwright', 'test', 'Home.profile.production.e2e.test.ts'],
        {
          cwd,
          stdio: 'inherit',
          timeout: 120_000,
          env: {
            ...process.env,
            TEST_PREBUILT: 'true',
            TEST_PRODUCTION_ROUTES: 'true'
          }
        }
      )
    }
    process.stdout.write(
      `${name} installed scenario passed in ${Math.round(
        (performance.now() - start) / seconds
      )}s\n`
    )
  }
} finally {
  rmSync(sandbox, { recursive: true, force: true })
}
