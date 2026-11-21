import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  existsSync,
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
import { setImmediate } from 'node:timers/promises'
import { URL } from 'node:url'

import { parse } from 'valibot'

import { addProfileBrowserTest } from './addProfileBrowserTest/index.ts'
import { message, messages, type Language } from './cli-language.ts'
import { configureAppTitle } from './configureAppTitle/index.ts'
import { configureClient } from './configureClient/index.ts'
import { configureFileHostGuides } from './configureFileHostGuides/index.ts'
import { configureFonts } from './configureFonts/index.ts'
import { configureBrowserPaths } from './configureLocales/configure-browser-paths.ts'
import { configureLocaleCopy } from './configureLocales/configure-locale-copy.ts'
import { configureLocaleGuides } from './configureLocales/configure-locale-guides.ts'
import { configureSingleLocaleTests } from './configureLocales/configure-single-locale-tests.ts'
import { configureLocales } from './configureLocales/index.ts'
import { configureLocaleUi } from './configureLocaleUi/index.ts'
import { configurePageTitles } from './configurePageTitles/index.ts'
import { configurePlainApp } from './configurePlainApp/index.ts'
import { removeCatalogTasks } from './configurePlainApp/remove-catalog-tasks.ts'
import { configureSeo } from './configureSeo/index.ts'
import { configureSiteIdentity } from './configureSiteIdentity/index.ts'
import { configureStandaloneGuides } from './configureStandaloneGuides/index.ts'
import { configureStatic } from './configureStatic/index.ts'
import { defaultSiteUrl } from './constants/site-url.ts'
import { editTemplate } from './edit-template.ts'
import {
  installProfile,
  resumeSteps,
  type SetupCommand
} from './installProfile/index.ts'
import { isDestinationEntry } from './isDestinationEntry/index.ts'
import { applyPreparedGuides } from './prepared-guides.ts'
import { applyPreparedSource } from './prepared-source.ts'
import { removeFeatureFiles } from './removeFeatureFiles/index.ts'
import { rewriteKnip, rewriteVite } from './rewrite.ts'
import { manifestSchema, settingsSchema } from './schema.ts'
import { shellDirectory } from './shellDirectory/index.ts'
import { checkTools, hasRepository, hasTool } from './tools.ts'
import type {
  FileWrite,
  GenerationContext,
  Profile,
  StagedContext,
  Versions
} from './types.ts'
import { CanceledError } from './usage-error.ts'
import { validateProfile } from './validateProfile/index.ts'

const maxPackageNameLength = 214
const jsonIndent = 2
function section(name: string, entries: Versions) {
  return `${name}:\n${Object.entries(entries)
    .map(([key, value]) => `  '${key}': '${value}'`)
    .join('\n')}\n`
}

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
      file =>
        isDestinationEntry(file) && path.resolve(destination, file) !== stage
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
type NextSteps = {
  profile: Profile
  language: Language
  siteUrl: URL | undefined
  shouldRetryGit?: boolean
}
function nextSteps({
  profile,
  language,
  siteUrl,
  shouldRetryGit
}: NextSteps): string[] {
  const next = [`cd ${shellDirectory(profile.dir)}`]
  if (!hasTool('bun')) next.unshift(messages[language].missingBun)
  if (shouldRetryGit) next.push('git init')
  if (!profile.shouldInstall) {
    next.push(`${profile.pm} install`)
  }
  next.push(`${profile.pm} run dev`)
  if (siteUrl?.origin === defaultSiteUrl) {
    next.push(messages[language].setUrl)
  }
  next.push(messages[language].publishList)
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

function removeEmptyFolders(folder: string): void {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const child = path.join(folder, entry.name)
    removeEmptyFolders(child)
    if (readdirSync(child).length === 0) rmdirSync(child)
  }
}
type TranslationOptions = {
  context: StagedContext
  prepare: typeof applyPreparedSource
}
function configureTranslationProfile({
  context,
  prepare
}: TranslationOptions): void {
  const { profile, stage, pkg } = context
  if (profile.hasI18n === false) {
    removeCatalogTasks(pkg)
    configurePlainApp(context)
    prepare({ stage })
    return
  }
  if ((profile.mode ?? 'server') === 'server') {
    prepare({
      stage,
      files: [
        ...configureBrowserPaths(context),
        ...configureSingleLocaleTests(context)
      ]
    })
  } else {
    prepare({ stage, files: configureSingleLocaleTests(context) })
  }
}

type CatalogNotice = Pick<StagedContext, 'stage' | 'write'> & {
  seeded: string[]
}
function recordSeededCatalogs({ stage, write, seeded }: CatalogNotice): void {
  if (seeded.length > 0) {
    const file = 'README.md'
    const text = readFileSync(path.join(stage, file), 'utf8')
    const pattern = '## Before publishing\n\n'
    const lines = seeded.map(
      tag => `- Translate the seeded catalog for \`${tag}\`.`
    )
    write({
      file,
      content: editTemplate({
        file,
        text,
        pattern,
        replacement: () => `${pattern}${lines.join('\n')}\n`
      })
    })
  }
}

type ReportCatalogs = { profile: Profile; seeded: string[]; language: Language }
function reportSeededCatalogs({
  profile,
  seeded,
  language
}: ReportCatalogs): string[] {
  const notices = seeded.map(tag =>
    message(language, { code: 'seed', values: { tag } })
  )
  if (notices.length > 0) profile.onSeededCatalogs?.(notices)
  return profile.onSeededCatalogs ? [] : notices
}

type Preparation = {
  templateGuides?: (stage: string) => void
  guides: (stage: string) => void
  source: typeof applyPreparedSource
}
type GuidePreparation = {
  context: StagedContext
  hasTemplateLanguageSettings: boolean
  prepare: Preparation
}
function prepareLocaleGuides({
  context,
  hasTemplateLanguageSettings,
  prepare
}: GuidePreparation): void {
  // The build records both template and rewritten guides. At runtime the prepared
  // template already has the right wording when its language settings are unchanged.
  if (hasTemplateLanguageSettings) prepare.templateGuides?.(context.stage)
  if (!hasTemplateLanguageSettings || prepare.templateGuides) {
    configureLocaleGuides(context)
  }
  prepare.guides(context.stage)
}
type GenerationOptions = { input: Profile; prepare: Preparation }
type Generation = GenerationOptions & { language: Language }
type Progress = 'creating' | SetupCommand['task']
type Step = 'creating' | SetupCommand | undefined
const prepared = { guides: applyPreparedGuides, source: applyPreparedSource }
type TerminalOptions = {
  isInteractive?: boolean
  language: Language
  warn?: (diagnostic: string) => void
  report: (progress: Progress) => void
}
const childInterruptDeadlineMs = 750
type SetupOptions = { cwd: string; signal: AbortSignal; isInteractive: boolean }
async function executeSetup(
  command: SetupCommand,
  { cwd, signal, isInteractive }: SetupOptions
): Promise<void> {
  const child = spawn(command.executable, command.args, {
    cwd,
    stdio: [
      'ignore',
      command.task === 'gitTask' || isInteractive ? 'ignore' : 'inherit',
      'pipe'
    ]
  })
  const tailLimit = 8192
  const diagnosticLines = 6
  let diagnostic = ''
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    diagnostic = (diagnostic + chunk).slice(-tailLimit)
  })
  let deadline: ReturnType<typeof setTimeout> | undefined
  const forced = Promise.withResolvers<typeof child.signalCode>()
  const force = () => {
    const release = () => {
      child.stderr.destroy()
      forced.resolve(child.signalCode)
    }
    if (child.exitCode !== null || child.signalCode !== null) release()
    else {
      child.once('exit', release)
      child.kill('SIGKILL')
    }
  }
  const cancel = () => {
    child.kill('SIGINT')
    deadline = setTimeout(force, childInterruptDeadlineMs)
    for (const signalName of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
      process.on(signalName, force)
    }
  }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    await Promise.race([once(child, 'close'), forced.promise])
    if (signal.aborted || child.signalCode === 'SIGINT') {
      throw new CanceledError()
    }
    if (child.exitCode !== 0) {
      throw new Error(
        diagnostic.trimEnd().split('\n').slice(-diagnosticLines).join('\n'),
        { cause: child.signalCode ?? child.exitCode }
      )
    }
  } finally {
    clearTimeout(deadline)
    for (const signalName of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
      process.off(signalName, force)
    }
    signal.removeEventListener('abort', cancel)
  }
}
type GitOptions = { profile: Profile; language: Language }
function* initializeGit({
  profile,
  language
}: GitOptions): Generator<SetupCommand, boolean> {
  if (profile.shouldInitGit && !hasRepository(profile.dir)) {
    try {
      yield { task: 'gitTask', executable: 'git', args: ['init'] }
    } catch (error) {
      if (error instanceof CanceledError) {
        throw new CanceledError(
          resumeSteps({ profile, language, shouldRetryGit: true }),
          { cause: error }
        )
      }
      return true
    }
  }
  return false
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
      .basename(path.resolve(profile.dir))
      .toLowerCase()
      .replaceAll(/[^a-z0-9-]+/gu, '-')
      .replaceAll(/^-+|-+$/gu, '')
      .slice(0, maxPackageNameLength) || 'solid-app'
  pkg.description = 'SolidJS application built with Vite+.'
}
export function* generation({
  input,
  prepare,
  language
}: Generation): Generator<Step, string[]> {
  const { problems, defaults, languages, title, siteUrl } =
    validateProfile(input)
  if (problems[0]) throw problems[0]
  const profile = input.mode === 'client' ? { ...input, hasSeo: false } : input
  const template = path.resolve(import.meta.dirname, '../template')
  const seeded = languages.locales.filter(
    tag => !defaults.locales.includes(tag) && profile.hasI18n !== false
  )
  const settingsFile = new URL('../dist/settings.json', import.meta.url)
  const settings = parse(
    settingsSchema,
    JSON.parse(readFileSync(settingsFile, 'utf8'))
  )
  checkTools({ profile, language })
  yield 'creating'
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
    configureLocales({ stage, settings: languages })
    configureStatic(context)
    configureFonts({ stage, hasFonts: profile.hasFonts })
    configureSeo(context)
    configureClient(context)
    const hasTemplateLocales =
      JSON.stringify(languages.locales) === JSON.stringify(defaults.locales)
    configureLocaleUi({ ...context, hasTemplateLocales })
    configureFileHostGuides(context)
    configureStandaloneGuides(context)
    mkdirSync(path.join(stage, 'src/tests/pages/Home'), { recursive: true })
    addProfileBrowserTest(context)
    configureSiteIdentity(context)
    configureLocaleCopy(context)
    const hasTemplateLanguageSettings =
      hasTemplateLocales && languages.baseLocale === defaults.baseLocale
    prepareLocaleGuides({ context, hasTemplateLanguageSettings, prepare })
    recordSeededCatalogs({ stage, write, seeded })
    configureAppTitle({ context, title })
    configurePageTitles({ context, title })
    configureTranslationProfile({ context, prepare: prepare.source })
    write({
      file: 'package.json',
      content: `${JSON.stringify(pkg, null, jsonIndent)}\n`
    })
    removeEmptyFolders(stage)
    yield
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
  const notices = reportSeededCatalogs({ profile, seeded, language })
  const shouldRetryGit = yield* initializeGit({ profile, language })
  yield* installProfile({ profile, language, shouldRetryGit })
  return [
    ...notices,
    ...nextSteps({ profile, language, siteUrl, shouldRetryGit })
  ]
}

export function generateSource(options: GenerationOptions): string[] {
  const steps = generation({ ...options, language: 'en' })
  let current = steps.next()
  while (!current.done) {
    if (typeof current.value === 'object') {
      try {
        execFileSync(current.value.executable, current.value.args, {
          cwd: options.input.dir,
          stdio: 'inherit'
        })
      } catch (error) {
        current = steps.throw(error)
        continue
      }
    }
    current = steps.next()
  }
  return current.value
}
export function generate(input: Profile): string[] {
  return generateSource({ input, prepare: prepared })
}
export async function generateTerminal(
  input: Profile,
  { language, report, warn, isInteractive = false }: TerminalOptions
): Promise<string[]> {
  const steps = generation({ input, prepare: prepared, language })
  const controller = new AbortController()
  const cancel = () => controller.abort()
  const signals = ['SIGINT', 'SIGHUP', 'SIGTERM'] as const
  for (const signal of signals) process.on(signal, cancel)
  try {
    let current = steps.next()
    while (!current.done) {
      const step = current.value
      if (step !== undefined) {
        report(typeof step === 'string' ? step : step.task)
      }
      await setImmediate()
      try {
        controller.signal.throwIfAborted()
        if (typeof step === 'object') {
          await executeSetup(step, {
            isInteractive,
            cwd: input.dir,
            signal: controller.signal
          })
        }
      } catch (error) {
        if (
          typeof step === 'object' &&
          step.task === 'gitTask' &&
          !controller.signal.aborted &&
          !(error instanceof CanceledError)
        ) {
          warn?.(
            error instanceof Error
              ? (error.message.split('\n').at(-1) ?? '')
              : ''
          )
        }
        current = steps.throw(
          controller.signal.aborted ? new CanceledError() : error
        )
        continue
      }
      current = steps.next()
    }
    return current.value
  } finally {
    for (const signal of signals) process.off(signal, cancel)
  }
}
export type { Profile } from './types.ts'
