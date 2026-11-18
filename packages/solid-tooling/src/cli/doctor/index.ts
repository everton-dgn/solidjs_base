import { access, readFile, readdir, realpath } from 'node:fs/promises'
import { createRequire, findPackageJSON } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import * as v from 'valibot'

import { readDependencies } from '../../knip/readDependencies/index.ts'
import { agents } from '../agents/index.ts'
import { featureWarnings, type readPreset } from './features.ts'

const testRange: unknown = createRequire(import.meta.url)(
  'semver/functions/satisfies.js'
)
function isRangePredicate(
  value: unknown
): value is (version: string, range: string) => boolean {
  return typeof value === 'function'
}
function satisfies(version: string, range: string): boolean {
  if (!isRangePredicate(testRange)) {
    throw new Error('Invalid semver installation')
  }
  return testRange(version, range)
}
const versionsSchema = v.optional(v.record(v.string(), v.string()))
const peerMetadata = v.object({ optional: v.optional(v.boolean()) })
const engines = v.object({ node: v.optional(v.string()) })
const metadata = v.optional(v.record(v.string(), peerMetadata))
const manifestSchema = v.object({
  name: v.string(),
  version: v.optional(v.string(), ''),
  scripts: versionsSchema,
  dependencies: versionsSchema,
  peerDependencies: versionsSchema,
  optionalDependencies: versionsSchema,
  peerDependenciesMeta: metadata,
  engines: v.optional(engines)
})
type Manifest = v.InferOutput<typeof manifestSchema>
type Installed = { manifest: Manifest; file: string; source: string }
type Check = {
  id: string
  status: 'ok' | 'warning' | 'error'
  package: string
  expected: string
  observed: string
  source: string
  file: string
  fix: string
}
const BASE = new Map([
  ['@evertondgn/solid-tooling', 'solid-base-app'],
  ['@evertondgn/solid-runtime', 'solid-base-runtime'],
  ['@evertondgn/vite-plugin-solid-icons', 'solid-icons']
])
const FAMILY = new Set([
  'solid-js',
  '@solidjs/web',
  '@solidjs/compiler',
  '@solidjs/signals',
  '@solidjs/diagnostics'
])
async function manifest(file: string): Promise<Manifest> {
  return v.parse(manifestSchema, JSON.parse(await readFile(file, 'utf8')))
}
async function accessible(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}
async function resolvePackage({
  name,
  source
}: {
  name: string
  source: string
}): Promise<Installed | undefined> {
  try {
    let candidate = findPackageJSON(name, pathToFileURL(source))
    if (name === '@evertondgn/solid-runtime') {
      let dir = path.dirname(createRequire(source).resolve(`${name}/env`))
      while (dir !== path.dirname(dir)) {
        const file = path.join(dir, 'package.json')
        const parent = (await accessible(file))
          ? await manifest(file)
          : undefined
        if (parent?.name === name) {
          candidate = file
          break
        }
        dir = path.dirname(dir)
      }
    }
    if (!candidate) return undefined
    const file = await realpath(candidate)
    return { file, source, manifest: await manifest(file) }
  } catch {
    return undefined
  }
}

type Report = {
  root: string
  workspaceRoot: string
  packages: { package: string; version: string; source: string; file: string }[]
  skills: { package: string; source: string; path: string }[]
  checks: Check[]
  validation: { cwd: string; commands: string[] }
}
async function inspectSkills({
  dep,
  skill,
  report
}: {
  dep: Installed
  skill: string | undefined
  report: Report
}) {
  const { name } = dep.manifest
  const dir = path.join(path.dirname(dep.file), 'skills')
  let required = skill ? [skill] : []
  if (!skill && (await accessible(dir))) {
    const entries = await readdir(dir, { withFileTypes: true })
    required = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  }
  for (const entry of required.length > 0 ? required : ['']) {
    const target = path.join(dir, entry, 'SKILL.md')
    let present = true
    try {
      await readFile(target, 'utf8')
    } catch {
      present = false
    }
    report.checks.push({
      package: name,
      source: dep.source,
      file: dep.file,
      id: 'skill-present',
      status: present ? 'ok' : 'error',
      expected: target,
      observed: present ? 'present' : 'missing',
      fix: 'Use a package release that includes the skill.'
    })
    if (present) {
      report.skills.push({ package: name, source: dep.source, path: target })
    }
  }
}
export async function doctor({
  root,
  preset
}: {
  root: string
  preset?: ReturnType<typeof readPreset>
}): Promise<Report> {
  const file = path.join(root, 'package.json')
  const app = await manifest(file)
  let workspaceRoot = root
  for (let dir = root; ; dir = path.dirname(dir)) {
    if (await accessible(path.join(dir, 'bun.lock'))) {
      workspaceRoot = dir
      break
    }
    if (path.dirname(dir) === dir) break
  }
  const report: Report = {
    root,
    workspaceRoot,
    checks: [],
    skills: [],
    packages: [],
    validation: { cwd: root, commands: [] }
  }
  const { checks, packages } = report
  const queue: Installed[] = [{ manifest: app, file, source: file }]
  const visited = new Set([file])
  const versions = new Map<string, string>()
  async function record(dep: Installed) {
    const { name, version } = dep.manifest
    const context = { package: name, file: dep.source, source: dep.source }
    if (visited.has(dep.file)) return
    visited.add(dep.file)
    const skill = BASE.get(name)
    if (!skill && !FAMILY.has(name) && name !== '@solidjs/vite-plugin') {
      return
    }
    queue.push(dep)
    packages.push({ ...context, file: dep.file, version })
    const group = skill ? 'solid-base-version' : 'solid-family-version'
    if (skill || FAMILY.has(name)) {
      const expected = versions.get(group) ?? version
      versions.set(group, expected)
      checks.push({
        ...context,
        id: group,
        status: version === expected ? 'ok' : 'error',
        expected,
        observed: version,
        file: path.join(workspaceRoot, 'package.json'),
        fix: 'Align the versions in the installation root overrides.'
      })
    }
    const engine = dep.manifest.engines?.node
    if (skill && engine) {
      checks.push({
        ...context,
        id: 'node-version',
        status: satisfies(process.versions.node, engine) ? 'ok' : 'error',
        expected: engine,
        observed: process.versions.node,
        fix: 'Use a compatible Node version.'
      })
    }
    if (skill || name === 'solid-js' || name === '@solidjs/diagnostics') {
      await inspectSkills({ dep, skill, report })
    }
  }
  async function inspect({ owner, name }: { owner: Installed; name: string }) {
    const base = BASE.has(owner.manifest.name)
    const peer = base ? owner.manifest.peerDependencies?.[name] : undefined
    if (
      owner.file !== file &&
      !BASE.has(name) &&
      !FAMILY.has(name) &&
      !peer &&
      name !== '@solidjs/vite-plugin'
    ) {
      return
    }
    const dep = await resolvePackage({ name, source: owner.file })
    const optional =
      owner.manifest.optionalDependencies?.[name] !== undefined ||
      owner.manifest.peerDependenciesMeta?.[name]?.optional
    const context = { package: name, source: owner.file, file: owner.file }
    if (!dep) {
      if (!optional) {
        checks.push({
          ...context,
          id: 'dependency-unresolved',
          status: 'error',
          expected: peer ?? 'installed',
          observed: 'missing',
          fix: 'Install the declared dependency.'
        })
      }
      return
    }
    const { version } = dep.manifest
    if (peer) {
      checks.push({
        ...context,
        file: path.join(workspaceRoot, 'package.json'),
        id: 'peer-version',
        status: satisfies(version, peer) ? 'ok' : 'error',
        expected: peer,
        observed: version,
        fix: 'Install a compatible peer version.'
      })
    }
    await record(dep)
  }
  const declared = await readDependencies(root)
  checks.push(
    ...(await featureWarnings({ root, dependencies: declared, preset }))
  )
  for (const owner of queue) {
    const names =
      owner.file === file
        ? declared
        : Object.keys({
            ...owner.manifest.dependencies,
            ...owner.manifest.peerDependencies,
            ...owner.manifest.optionalDependencies
          })
    for (const name of new Set(names)) await inspect({ owner, name })
  }
  let state: string
  try {
    state = await agents({ root, write: false })
  } catch (error) {
    state = String(error)
  }
  let blockStatus: Check['status'] = 'error'
  if (state === 'current') blockStatus = 'ok'
  if (state === 'missing') blockStatus = 'warning'
  checks.push({
    id: 'agents-block',
    package: app.name,
    status: blockStatus,
    observed: state,
    expected: 'current',
    file: path.join(root, 'AGENTS.md'),
    source: root,
    fix: 'Run vp run agents.'
  })
  const commands = [
    ...new Set([...Object.keys(app.scripts ?? {}), ...(preset?.tasks ?? [])])
  ]
    .filter(name =>
      [
        'validate',
        'check:ci',
        'test',
        'build',
        'dead-code',
        'check-project',
        'typecheck-node',
        'test-tooling',
        'dead-code-project'
      ].includes(name)
    )
    .map(name => `vp run ${name}`)
  report.validation.commands = commands
  return report
}
