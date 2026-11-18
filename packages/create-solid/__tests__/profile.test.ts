import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { after, before, describe, it } from 'node:test'

import { parse } from 'valibot'

import { manifestSchema } from '../src/types.ts'

const bin = path.resolve('dist/create-solid.mjs')
const manifest = (file: string) =>
  parse(manifestSchema, JSON.parse(readFileSync(file, 'utf8')))
const root = manifest('../../package.json')
const source = manifest('../../apps/boilerplate/package.json')
const tooling = manifest('../solid-tooling/package.json')
for (const pm of ['bun', 'pnpm', 'npm']) {
  await describe(pm, () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'solid-profile-'))
    const read = (file: string) => readFileSync(path.join(dir, file), 'utf8')
    before(() => {
      execFileSync(process.execPath, [
        bin,
        dir,
        '--no-install',
        '--no-git',
        ...(pm === 'bun' ? [] : ['--pm', pm])
      ])
    })
    after(() => {
      rmSync(dir, { recursive: true, force: true })
    })
    void it('rewrites the identity and installer', () => {
      const app = manifest(path.join(dir, 'package.json'))
      assert.equal(app.name, path.basename(dir).toLowerCase())
      assert.notEqual(app.description, source.description)
      assert.equal(app.packageManager?.split('@')[0], pm)
    })
    void it('preserves Bun environment isolation for every installer', () => {
      assert.equal(
        read('bunfig.toml'),
        readFileSync('../../bunfig.toml', 'utf8')
      )
    })
    void it('uses a neutral public site origin', () => {
      assert.match(read('.env'), /^VITE_SITE_URL=https:\/\/example.com$/mu)
    })
    void it('rejects invalid arguments without printing a stack', () => {
      const result = spawnSync(process.execPath, [bin, '--unknown'], {
        encoding: 'utf8'
      })
      assert.equal(result.status, 2)
      assert.doesNotMatch(result.stderr, /\n +at /u)
    })
    void it('resolves every workspace and catalog entry', () => {
      const app = manifest(path.join(dir, 'package.json'))
      for (const group of ['dependencies', 'devDependencies'] as const) {
        for (const [name, spec] of Object.entries(source[group])) {
          if (spec === 'catalog:') {
            assert.equal(app[group][name], root.catalog?.[name])
          } else if (spec === 'workspace:*') {
            assert.equal(
              app[group][name],
              manifest(`../${path.basename(name)}/package.json`).version
            )
          } else assert.equal(app[group][name], spec)
        }
      }
    })
    void it('installs hooks through the guarded tooling command', () => {
      const app = manifest(path.join(dir, 'package.json'))
      assert.equal(app.devDependencies.lefthook, tooling.dependencies.lefthook)
      assert.ok(app.scripts.prepare?.includes('git rev-parse --show-toplevel'))
      assert.match(
        app.scripts.prepare ?? '',
        /^if .*git rev-parse .*lefthook install; fi$/u
      )
      assert.equal(existsSync(path.join(dir, '.git')), false)
    })
    void it('registers native patches and overrides for the installer', () => {
      const app = manifest(path.join(dir, 'package.json'))
      assert.ok(root.overrides && root.patchedDependencies)
      const [[key, file] = []] = Object.entries(root.patchedDependencies)
      assert.ok(key && file)
      const relative = file.replace('apps/boilerplate/', '')
      assert.equal(existsSync(path.join(dir, relative)), pm !== 'npm')
      if (pm === 'pnpm') {
        const yaml = read('pnpm-workspace.yaml')
        assert.ok(yaml.includes(`'${key}': '${relative}'`))
        assert.ok(yaml.includes('allowBuilds:\n  lefthook: false'))
      } else if (pm === 'bun') {
        assert.equal(app.patchedDependencies?.[key], relative)
      } else assert.equal(app.patchedDependencies, undefined)
      for (const [name, spec] of Object.entries(root.overrides)) {
        const value = spec === 'catalog:' ? root.catalog?.[name] : spec
        if (pm === 'pnpm') {
          assert.ok(
            read('pnpm-workspace.yaml').includes(`'${name}': '${value}'`)
          )
        } else assert.equal(app.overrides?.[name], value)
      }
    })
    void it('removes workspace inputs and catalog suppression', () => {
      assert.doesNotMatch(read('vite.config.ts'), /workspace:/u)
      assert.doesNotMatch(read('tooling/knip.ts'), /catalogReferences/u)
    })
    void it('refuses an existing application', () => {
      assert.notEqual(
        spawnSync(process.execPath, [bin, dir, '--no-install']).status,
        0
      )
    })
  })
}
