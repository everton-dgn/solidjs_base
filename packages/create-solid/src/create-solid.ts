#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  cpSync
} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { URL } from 'node:url'
import { parseArgs } from 'node:util'

import { parse } from 'valibot'

import { rewriteKnip } from './rewrite.ts'
import {
  manifestSchema,
  settingsSchema,
  type Manifest,
  type Versions
} from './types.ts'

const jsonIndent = 2
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    pm: { type: 'string', default: 'bun' },
    help: { type: 'boolean' },
    'no-git': { type: 'boolean' },
    'no-install': { type: 'boolean' }
  }
})
const usage =
  'create-solid <dir> [--pm bun|pnpm|npm] [--no-git] [--no-install]\nBun is required to run application tasks with every installer.'
if (values.help) {
  process.stdout.write(`${usage}\n`)
  process.exit(0)
}
const versions = { bun: '1.4.4', pnpm: '12.21.0', npm: '12.2.3' }
if (
  positionals.length !== 1 ||
  !positionals[0] ||
  (values.pm !== 'bun' && values.pm !== 'pnpm' && values.pm !== 'npm')
) {
  throw new Error(usage)
}
const profile = {
  pm: values.pm,
  dir: path.resolve(positionals[0]),
  git: !values['no-git'],
  install: !values['no-install']
} as const
const template = path.resolve(import.meta.dirname, '../template')
const settingsFile = new URL('settings.json', import.meta.url)
const settings = parse(
  settingsSchema,
  JSON.parse(readFileSync(settingsFile, 'utf8'))
)
const write = (file: string, content: string) =>
  writeFileSync(path.join(profile.dir, file), content)
function resolveVersion(name: string, spec: string) {
  let resolved: string | undefined = spec
  if (spec === 'catalog:') {
    resolved = settings.catalog[name]
  }
  if (spec === 'workspace:*') {
    resolved = settings.versions[name]
  }
  if (typeof resolved !== 'string') {
    throw new TypeError(`Missing version for ${name}`)
  }
  return resolved
}
function resolveGroup(group: Versions) {
  return Object.fromEntries(
    Object.entries(group).map(([name, spec]) => [
      name,
      resolveVersion(name, spec)
    ])
  )
}
function section(name: string, entries: Versions) {
  return `${name}:\n${Object.entries(entries)
    .map(([key, value]) => `  '${key}': '${value}'`)
    .join('\n')}\n`
}
function configureInstaller(pkg: Manifest) {
  const { pm } = profile
  pkg.packageManager = `${pm}@${versions[pm]}`
  const overrides = resolveGroup(settings.overrides)
  if (pm === 'pnpm') {
    write(
      'pnpm-workspace.yaml',
      `${
        section('overrides', overrides) +
        section('patchedDependencies', settings.patches)
      }allowBuilds:\n  lefthook: false\n`
    )
  } else pkg.overrides = overrides
  if (pm === 'bun') {
    pkg.patchedDependencies = settings.patches
    write('bunfig.toml', settings.bunfig)
  }
}
function configureHooks(pkg: Manifest) {
  pkg.devDependencies.lefthook = settings.lefthook
  pkg.scripts.prepare =
    'if git rev-parse --git-dir > /dev/null 2>&1; then vp exec node node_modules/@evertondgn/solid-tooling/dist/cli.mjs lefthook install; fi'
  write(
    '.lefthook.yml',
    'extends:\n  - node_modules/@evertondgn/solid-tooling/lefthook.yml\n'
  )
  write(
    '.commitlintrc',
    `${JSON.stringify(
      { extends: ['@evertondgn/solid-tooling/commitlint'] },
      null,
      jsonIndent
    )}\n`
  )
}
function rewriteIdentity(pkg: Manifest) {
  pkg.name = path.basename(profile.dir)
  pkg.description = 'SolidJS application built with Vite+.'
}
function removeWorkspaceInputs() {
  const vite = readFileSync(path.join(template, 'vite.config.ts'), 'utf8')
  write(
    'vite.config.ts',
    vite.replace(/,\n {2}\/\/ In the monorepo,[\s\S]+?\n {2}\}\n\}\)/u, '\n})')
  )
}
if (existsSync(profile.dir) && readdirSync(profile.dir).length > 0) {
  throw new Error('Destination must be empty')
}
mkdirSync(profile.dir, { recursive: true })
for (const file of readdirSync(template)) {
  if (file === 'package.json' || (profile.pm === 'npm' && file === 'patches')) {
    continue
  }
  cpSync(
    path.join(template, file),
    path.join(profile.dir, file === '_gitignore' ? '.gitignore' : file),
    { recursive: true }
  )
}
removeWorkspaceInputs()
const manifestFile = path.join(template, 'package.json')
const pkg = parse(
  manifestSchema,
  JSON.parse(readFileSync(manifestFile, 'utf8'))
)
rewriteIdentity(pkg)
pkg.dependencies = resolveGroup(pkg.dependencies)
pkg.devDependencies = resolveGroup(pkg.devDependencies)
configureInstaller(pkg)
configureHooks(pkg)
rewriteKnip(profile.dir)
cpSync(path.join(import.meta.dirname, 'profiles', profile.pm), profile.dir, {
  recursive: true
})
write('package.json', `${JSON.stringify(pkg, null, jsonIndent)}\n`)
if (profile.git) {
  execFileSync('git', ['init'], { cwd: profile.dir, stdio: 'inherit' })
}
if (profile.install) {
  execFileSync(profile.pm, ['install'], { cwd: profile.dir, stdio: 'inherit' })
}
process.stdout.write(`Open ${profile.dir}.\n`)
if (!profile.install) process.stdout.write(`Run ${profile.pm} install.\n`)
process.stdout.write('Run vp run dev.\n')
