import { access, readFile, readdir, realpath } from 'node:fs/promises'
import { createRequire, findPackageJSON } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import * as v from 'valibot'

import { readDependencies } from '../../knip/readDependencies/index.ts'
import { agents } from '../agents/index.ts'
import { featureWarnings } from './features.ts'
import type { Check, Preset, Report } from './types.ts'

type RangePredicate = (version: string, range: string) => boolean
type VersionRange = { version: string; range: string }

// WHY: semver ships CommonJS without type declarations, and the package does
// not add @types/semver for one function, so the guard types the export.
const testRange: unknown = createRequire(import.meta.url)(
  'semver/functions/satisfies.js'
)
function isRangePredicate(value: unknown): value is RangePredicate {
  return typeof value === 'function'
}
function satisfies({ version, range }: VersionRange): boolean {
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
type PackageRequest = { name: string; source: string }
type SkillInspection = {
  dep: Installed
  skill: string | undefined
  report: Report
}
type Dependency = { owner: Installed; name: string }
type DoctorInput = { root: string; preset?: Preset }
type AppTasks = { app: Manifest; preset?: Preset }
type BlockOwner = { root: string; name: string }

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
const VALIDATION_TASKS = new Set([
  'validate',
  'check:ci',
  'test',
  'build',
  'dead-code',
  'check-project',
  'typecheck-node',
  'test-tooling',
  'dead-code-project'
])
async function manifest(file: string): Promise<Manifest> {
  return v.parse(manifestSchema, JSON.parse(await readFile(file, 'utf8')))
}
async function isAccessible(file: string): Promise<boolean> {
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
}: PackageRequest): Promise<Installed | undefined> {
  try {
    let candidate = findPackageJSON(name, pathToFileURL(source))
    if (name === '@evertondgn/solid-runtime') {
      let dir = path.dirname(createRequire(source).resolve(`${name}/env`))
      while (dir !== path.dirname(dir)) {
        const file = path.join(dir, 'package.json')
        const parent = (await isAccessible(file))
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
async function inspectSkills({ dep, skill, report }: SkillInspection) {
  const { name } = dep.manifest
  const dir = path.join(path.dirname(dep.file), 'skills')
  let required = skill ? [skill] : []
  if (!skill && (await isAccessible(dir))) {
    const entries = await readdir(dir, { withFileTypes: true })
    required = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  }
  for (const entry of required.length > 0 ? required : ['']) {
    const target = path.join(dir, entry, 'SKILL.md')
    let isPresent = true
    try {
      await readFile(target, 'utf8')
    } catch {
      isPresent = false
    }
    report.checks.push({
      package: name,
      source: dep.source,
      file: dep.file,
      id: 'skill-present',
      status: isPresent ? 'ok' : 'error',
      expected: target,
      observed: isPresent ? 'present' : 'missing',
      fix: 'Use a package release that includes the skill.'
    })
    if (isPresent) {
      report.skills.push({ package: name, source: dep.source, path: target })
    }
  }
}
// The nearest bun.lock marks the installation root, whose package.json holds
// the overrides that align versions.
async function findWorkspaceRoot(root: string): Promise<string> {
  for (let dir = root; ; dir = path.dirname(dir)) {
    if (await isAccessible(path.join(dir, 'bun.lock'))) return dir
    if (path.dirname(dir) === dir) return root
  }
}
async function agentsBlockCheck({ root, name }: BlockOwner): Promise<Check> {
  let state: string
  try {
    state = await agents({ root, shouldWrite: false })
  } catch (error) {
    state = String(error)
  }
  let status: Check['status'] = 'error'
  if (state === 'current') status = 'ok'
  if (state === 'missing') status = 'warning'
  return {
    id: 'agents-block',
    package: name,
    status,
    observed: state,
    expected: 'current',
    file: path.join(root, 'AGENTS.md'),
    source: root,
    fix: 'Run vp run agents.'
  }
}
function validationCommands({ app, preset }: AppTasks): string[] {
  return [
    ...new Set([...Object.keys(app.scripts ?? {}), ...(preset?.tasks ?? [])])
  ]
    .filter(name => VALIDATION_TASKS.has(name))
    .map(name => `vp run ${name}`)
}

export async function doctor({ root, preset }: DoctorInput): Promise<Report> {
  const file = path.join(root, 'package.json')
  const app = await manifest(file)
  const workspaceRoot = await findWorkspaceRoot(root)
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
      const { node } = process.versions
      checks.push({
        ...context,
        id: 'node-version',
        status: satisfies({ version: node, range: engine }) ? 'ok' : 'error',
        expected: engine,
        observed: node,
        fix: 'Use a compatible Node version.'
      })
    }
    if (skill || name === 'solid-js' || name === '@solidjs/diagnostics') {
      await inspectSkills({ dep, skill, report })
    }
  }
  async function inspect({ owner, name }: Dependency) {
    const isBase = BASE.has(owner.manifest.name)
    const peer = isBase ? owner.manifest.peerDependencies?.[name] : undefined
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
    const isOptional =
      owner.manifest.optionalDependencies?.[name] !== undefined ||
      owner.manifest.peerDependenciesMeta?.[name]?.optional
    const context = { package: name, source: owner.file, file: owner.file }
    if (!dep) {
      if (!isOptional) {
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
        status: satisfies({ version, range: peer }) ? 'ok' : 'error',
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
  checks.push(await agentsBlockCheck({ root, name: app.name }))
  report.validation.commands = validationCommands({ app, preset })
  return report
}
