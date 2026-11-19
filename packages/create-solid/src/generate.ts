import { execFileSync } from 'node:child_process'
import {
  existsSync,
  accessSync,
  constants,
  statSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmdirSync,
  readdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  cpSync
} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { URL } from 'node:url'

import { parse } from 'valibot'

import { addProfileBrowserTest } from './addProfileBrowserTest/index.ts'
import { configureClient } from './configureClient/index.ts'
import { configureFileHostGuides } from './configureFileHostGuides/index.ts'
import { configureFonts } from './configureFonts/index.ts'
import { configureSeo } from './configureSeo/index.ts'
import { configureStandaloneGuides } from './configureStandaloneGuides/index.ts'
import { configureStatic } from './configureStatic/index.ts'
import { editTemplate } from './edit-template.ts'
import { installProfile } from './installProfile/index.ts'
import { applyPreparedGuides } from './prepared-guides.ts'
import { removeFeatureFiles } from './removeFeatureFiles/index.ts'
import { rewriteKnip, rewriteVite } from './rewrite.ts'
import { manifestSchema, settingsSchema } from './schema.ts'
import type { Profile } from './types.ts'
import { UsageError } from './usage-error.ts'

const maxPackageNameLength = 214
const jsonIndent = 2
function section(name: string, entries: Versions) {
  return `${name}:\n${Object.entries(entries)
    .map(([key, value]) => `  '${key}': '${value}'`)
    .join('\n')}\n`
}

function resolveSiteUrl(value?: string): URL {
  const siteUrl = new URL(value ?? 'https://example.com')
  if (
    !['http:', 'https:'].includes(siteUrl.protocol) ||
    siteUrl.href !== `${siteUrl.origin}/`
  ) {
    throw new UsageError('--site-url requires an HTTP or HTTPS origin')
  }
  return siteUrl
}

type Versions = Record<string, string>
function resolveVersion(
  settings: GenerationContext['settings'],
  [name, spec]: [string, string]
) {
  let resolved: string | undefined = spec
  if (spec === 'catalog:') {
    resolved = settings.catalog[name]
  }
  if (spec === 'workspace:*') {
    resolved = settings.versions[name]
  }
  if (resolved === undefined) {
    throw new Error(`Missing version for ${name}`)
  }
  return resolved
}
type Publication = { stage: string; destination: string }
function publishTree({ stage, destination }: Publication): void {
  if (!existsSync(destination)) {
    renameSync(stage, destination)
    return
  }
  if (
    readdirSync(destination).some(
      file => path.resolve(destination, file) !== stage
    )
  ) {
    throw new Error('Destination must be empty')
  }
  const moved: string[] = []
  try {
    for (const file of readdirSync(stage)) {
      renameSync(path.join(stage, file), path.join(destination, file))
      moved.push(file)
    }
    rmdirSync(stage)
  } catch (error) {
    for (const file of moved) {
      renameSync(path.join(destination, file), path.join(stage, file))
    }
    throw error
  }
}
function checkTools(profile: Profile): void {
  const tools = [
    ...(profile.shouldInitGit ? ['git'] : []),
    ...(profile.shouldInstall ? [profile.pm] : [])
  ]
  for (const tool of tools) {
    const hasTool = process.env.PATH?.split(path.delimiter).some(directory => {
      try {
        accessSync(path.join(directory, tool), constants.X_OK)
        return statSync(path.join(directory, tool)).isFile()
      } catch {
        return false
      }
    })
    if (!hasTool) {
      throw new Error(`Install ${tool} before generating the application.`)
    }
  }
}
function nextSteps(profile: Profile): string[] {
  const next = [`Open ${profile.dir}.`]
  if (!profile.shouldInstall) {
    next.push(`Run ${profile.pm} install.`)
    if (profile.pm === 'pnpm') {
      next.push('Run pnpm exec vp fmt pnpm-workspace.yaml.')
    }
  }
  next.push('Run vp run dev.')
  return next
}
function configureReadme({ stage, profile }: StagedContext): void {
  if (
    profile.hasIcons !== false &&
    profile.hasFonts !== false &&
    profile.hasTheme !== false
  ) {
    return
  }
  const variant = `icons-${profile.hasIcons !== false}-fonts-${profile.hasFonts !== false}-theme-${profile.hasTheme !== false}`
  const source = new URL(
    `../dist/readmes/${profile.pm}/${variant}/README.md`,
    import.meta.url
  )
  cpSync(source, path.join(stage, 'README.md'))
}

function configureTheme({ stage, profile }: StagedContext): void {
  if (profile.hasTheme !== false) return
  cpSync(new URL('../dist/without-theme/files/', import.meta.url), stage, {
    recursive: true
  })
  if (profile.hasIcons === false) {
    cpSync(
      new URL('../dist/without-theme/without-icons/', import.meta.url),
      stage,
      { recursive: true }
    )
  }
  removeFeatureFiles({ stage, disabled: ['theme'] })
}

function configureIcons(context: StagedContext): void {
  const { stage } = context
  if (context.profile.hasIcons !== false) return
  const variants = new URL('../dist/without-icons/files/', import.meta.url)
  cpSync(variants, stage, { recursive: true })
  renameSync(path.join(stage, '_gitignore'), path.join(stage, '.gitignore'))
  removeFeatureFiles({ stage, disabled: ['icons'] })
  delete context.pkg.devDependencies['@iconify-json/hugeicons']
}

function configureDiagnostics(context: StagedContext): void {
  const { stage } = context
  if (context.profile.hasDiagnostics !== false) return
  delete context.pkg.devDependencies['@solidjs/diagnostics']
  const file = 'docs/development.md'
  const guide = readFileSync(path.join(stage, file), 'utf8')
  const withoutGuide = editTemplate({
    file,
    text: guide,
    pattern: /^## Reactivity diagnostics in development\n[\s\S]*?(?=^## )/mu,
    replacement: ''
  })
  context.write({
    file,
    content: editTemplate({
      file,
      text: withoutGuide,
      pattern:
        '`solid-js`, `@solidjs/web` and `@solidjs/diagnostics`, respecting the\n  compatibility of the Vite plugin.',
      replacement:
        '`solid-js` and `@solidjs/web`, respecting the compatibility of the Vite\n  plugin.'
    })
  })
}

function resolveProfile(profile: Profile): Profile {
  if (profile.mode === 'client') {
    if (profile.hasSeo) {
      throw new UsageError(
        'Client rendering cannot publish SEO. Use --mode static.'
      )
    }
    return { ...profile, hasSeo: false }
  }
  return profile
}

function removeEmptyFolders(folder: string): void {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const child = path.join(folder, entry.name)
    removeEmptyFolders(child)
    if (readdirSync(child).length === 0) rmdirSync(child)
  }
}
export function resolveGroup(
  { settings }: GenerationContext,
  group: Versions
): Versions {
  return Object.fromEntries(
    Object.entries(group).map(([name, spec]) => [
      name,
      resolveVersion(settings, [name, spec])
    ])
  )
}
export function configureInstaller(context: GenerationContext): void {
  const { profile, settings, write, pkg } = context
  const versions = { bun: settings.bunVersion, pnpm: '12.21.0', npm: '12.2.3' }

  const { pm } = profile
  pkg.packageManager = `${pm}@${versions[pm]}`
  const overrides = resolveGroup(context, settings.overrides)
  if (pm === 'pnpm') {
    write({
      file: 'pnpm-workspace.yaml',
      content: `${
        section('overrides', overrides) +
        section('patchedDependencies', settings.patches)
      }allowBuilds:\n  lefthook: false\n`
    })
  } else pkg.overrides = overrides
  if (pm === 'bun') {
    pkg.patchedDependencies = settings.patches
  }
  write({ file: 'bunfig.toml', content: settings.bunfig })
}
export function configureHooks({
  pkg,
  settings,
  write
}: GenerationContext): void {
  pkg.devDependencies.lefthook = settings.lefthook
  pkg.scripts.prepare =
    'if [ "$(git rev-parse --show-toplevel 2>/dev/null)" = "$(pwd -P)" ]; then vp exec node node_modules/@evertondgn/solid-tooling/dist/cli.mjs lefthook install; fi'
  write({
    file: '.lefthook.yml',
    content:
      'extends:\n  - node_modules/@evertondgn/solid-tooling/lefthook.yml\n'
  })
  write({
    file: '.commitlintrc',
    content: `${JSON.stringify(
      { extends: ['@evertondgn/solid-tooling/commitlint'] },
      null,
      jsonIndent
    )}\n`
  })
}
export function rewriteIdentity({ pkg, profile }: GenerationContext): void {
  pkg.name =
    path
      .basename(profile.dir)
      .toLowerCase()
      .replaceAll(/[^a-z0-9-]+/gu, '-')
      .replaceAll(/^-+|-+$/gu, '')
      .slice(0, maxPackageNameLength) || 'solid-app'
  pkg.description = 'SolidJS application built with Vite+.'
}
export function generateSource(
  input: Profile,
  prepareGuides: (stage: string) => void
): string[] {
  const profile = resolveProfile(input)
  if (profile.hasSeo === false && profile.siteUrl !== undefined) {
    throw new UsageError('--site-url requires SEO')
  }
  const template = path.resolve(import.meta.dirname, '../template')
  const settingsFile = new URL('../dist/settings.json', import.meta.url)
  const settings = parse(
    settingsSchema,
    JSON.parse(readFileSync(settingsFile, 'utf8'))
  )
  const siteUrl =
    profile.hasSeo === false ? undefined : resolveSiteUrl(profile.siteUrl)
  if (existsSync(profile.dir) && readdirSync(profile.dir).length > 0) {
    throw new Error('Destination must be empty')
  }
  checkTools(profile)
  const parent = path.dirname(path.resolve(profile.dir))
  const firstParent = mkdirSync(parent, { recursive: true })
  const stageParent = existsSync(profile.dir)
    ? path.resolve(profile.dir)
    : parent
  const stage = mkdtempSync(path.join(stageParent, '.create-solid-'))
  const write = ({ file, content }: FileWrite) =>
    writeFileSync(path.join(stage, file), content)
  try {
    for (const file of readdirSync(template)) {
      if (
        file === 'package.json' ||
        (profile.pm === 'npm' && file === 'patches')
      ) {
        continue
      }
      cpSync(
        path.join(template, file),
        path.join(stage, file === '_gitignore' ? '.gitignore' : file),
        { recursive: true }
      )
    }
    const env = readFileSync(path.join(template, '.env'), 'utf8')
    write({
      file: '.env',
      content: editTemplate({
        file: '.env',
        text: env,
        pattern: /^VITE_SITE_URL=.*\n/mu,
        replacement: () =>
          siteUrl === undefined ? '' : `VITE_SITE_URL=${siteUrl.origin}\n`
      })
    })
    const manifestFile = path.join(template, 'package.json')
    const pkg = parse(
      manifestSchema,
      JSON.parse(readFileSync(manifestFile, 'utf8'))
    )
    const context = { stage, profile, settings, pkg, write }
    configureIcons(context)
    configureTheme(context)
    rewriteVite(stage)
    configureDiagnostics(context)
    rewriteIdentity(context)
    pkg.dependencies = resolveGroup(context, pkg.dependencies)
    pkg.devDependencies = resolveGroup(context, pkg.devDependencies)
    configureInstaller(context)
    configureHooks(context)
    rewriteKnip(stage)
    const installerFiles = path.resolve(
      import.meta.dirname,
      '../dist/profiles',
      profile.pm
    )
    cpSync(installerFiles, stage, { recursive: true })
    configureReadme(context)
    configureStatic(context)
    configureFonts({ stage, hasFonts: profile.hasFonts })
    configureSeo(context)
    configureClient(context)
    configureFileHostGuides(context)
    configureStandaloneGuides(context)
    mkdirSync(path.join(stage, 'src/tests/pages/Home'), { recursive: true })
    addProfileBrowserTest(context)
    write({
      file: 'package.json',
      content: `${JSON.stringify(pkg, null, jsonIndent)}\n`
    })
    prepareGuides(stage)
    removeEmptyFolders(stage)
    publishTree({ stage, destination: profile.dir })
  } catch (error) {
    rmSync(stage, { recursive: true, force: true })
    if (firstParent) {
      for (let current = parent; ; current = path.dirname(current)) {
        if (readdirSync(current).length > 0) break
        rmdirSync(current)
        if (current === firstParent) break
      }
    }
    throw error
  }
  if (profile.shouldInitGit) {
    try {
      execFileSync('git', ['init'], { cwd: profile.dir, stdio: 'inherit' })
    } catch (error) {
      throw new Error(
        `Git initialization failed. Open ${profile.dir} and run git init with Git installed, or continue without Git. Run ${profile.pm} install to install dependencies.`,
        { cause: error }
      )
    }
  }
  installProfile(profile)
  return nextSteps(profile)
}

export function generate(input: Profile): string[] {
  return generateSource(input, applyPreparedGuides)
}

export type { Profile } from './types.ts'
export type GenerationContext = {
  profile: Profile
  pkg: {
    name: string
    description?: string
    packageManager?: string
    dependencies: Versions
    devDependencies: Versions
    scripts: Versions
    overrides?: Versions
    patchedDependencies?: Versions
  }
  settings: {
    bunVersion: string
    catalog: Versions
    versions: Versions
    overrides: Versions
    patches: Versions
    bunfig: string
    lefthook: string
  }
  write: (output: FileWrite) => void
}

export type FileWrite = { file: string; content: string }

export type StagedContext = GenerationContext & { stage: string }
