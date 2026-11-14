/* oxlint-disable node/no-sync -- Mutations only touch an owned temporary application and its installed packages. */
import assert from 'node:assert/strict'
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import { stdout } from 'node:process'

type SourceMutation = { app: string; mutation: string | undefined }
type Instrumentation = SourceMutation & { root: string }
type EnvBundle = { id: string; scenario: string; file: string }
type EnvCommand = {
  cwd: string
  deadline: number
  args: string[]
  expectedError?: RegExp
}
type EnvProbe = {
  app: string
  deadline: number
  run: (command: EnvCommand) => Promise<string>
}
type EnvPreparation = EnvProbe & {
  scenario: string
  dependencies: Record<string, string>
}
type EnvChecks = { lintFiles: string[]; typecheckFlags: string[] }

function importEnvFromClient(app: string): () => void {
  const file = path.join(app, 'src/entry-client.tsx')
  const source = readFileSync(file, 'utf8')
  writeFileSync(
    file,
    `import { env } from 'virtual:solid-env/server'\nconsole.log(env.PORT)\n${source}`
  )
  return () => writeFileSync(file, source)
}

export function assertEnvBootFailure(output: string): void {
  const diagnostic =
    /server env validation failed at boot[^\n]*\n\s*\n\s*[^\n]*PORT: [^\n]+/u
  assert.match(output, diagnostic)
  stdout.write(`Expected boot failure: ${diagnostic.exec(output)?.[0]}\n`)
}

export async function prepareEnvScenario({
  app,
  scenario,
  deadline,
  dependencies,
  run
}: EnvPreparation): Promise<EnvChecks> {
  if (scenario !== 'ssr-plain') {
    assert.ok(!existsSync(path.join(app, 'env.ts')))
    return { lintFiles: [], typecheckFlags: [] }
  }
  assert.ok(
    !dependencies.valibot,
    'The fragment needs no direct valibot dependency'
  )
  // Generate inferred declarations before lint and types on a clean installation.
  await run({ deadline, cwd: app, args: ['build'] })
  return { lintFiles: ['env.ts'], typecheckFlags: ['--strict'] }
}

export function checkEnvBundle({ id, scenario, file }: EnvBundle): boolean {
  const hasEnv = scenario === 'ssr-plain'
  const isClient = file === 'scenario-modules-client.json'
  if (hasEnv && isClient) assert.doesNotMatch(id, /valibot|solid-tooling/u)
  return (
    hasEnv &&
    !isClient &&
    id.endsWith('/node_modules/@evertondgn/solid-tooling/dist/env.mjs')
  )
}

export async function checkEnvFailures({
  app,
  deadline,
  run
}: EnvProbe): Promise<void> {
  const restore = importEnvFromClient(app)
  try {
    await run({
      deadline,
      cwd: app,
      args: ['build'],
      expectedError:
        /virtual:solid-env\/server is server-only and was imported from the client module graph/u
    })
  } finally {
    restore()
  }
}

export function mutateTheme({ app, mutation }: SourceMutation): void {
  if (mutation === 'theme-import') {
    const file = path.join(app, 'src/App.tsx')
    writeFileSync(
      file,
      `import { isTheme } from '@evertondgn/solid-runtime/theme/is-theme'\n${readFileSync(file, 'utf8').replace('<main', "<main data-theme={isTheme('dark')}")}`
    )
  }
  if (mutation === 'theme-nonce') {
    const file = path.join(app, 'src/App.tsx')
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace('<script nonce={nonce}>', '<script>')
    )
  }
}

export function mutateLocaleStandIn({ app, mutation }: SourceMutation): void {
  if (mutation === 'locale-node' || mutation === 'locale-setter') {
    const dist = path.join(app, 'node_modules/@evertondgn/solid-tooling/dist')
    let replacements = 0
    for (const name of readdirSync(dist).filter(entry =>
      entry.endsWith('.mjs')
    )) {
      const file = path.join(dist, name)
      const source = readFileSync(file, 'utf8')
      const changed =
        mutation === 'locale-setter'
          ? source.replace('export const setLocale = () => undefined', '')
          : source.replace(
              '[...NODE_STUBS, ["virtual:solid-app/locale", source]]',
              'NODE_STUBS'
            )
      if (source !== changed) {
        replacements += 1
        writeFileSync(file, changed)
      }
    }
    assert.equal(
      replacements,
      1,
      mutation === 'locale-setter'
        ? 'Remove exactly one single-language setLocale export'
        : 'Remove exactly one node locale stand-in'
    )
  }
}

export function instrument({ app, mutation, root }: Instrumentation): void {
  if (mutation === 'tool-bundle') {
    const entry = path.join(app, 'src/App.tsx')
    writeFileSync(
      entry,
      `import { fmt } from '@evertondgn/solid-tooling/fmt'\nglobalThis.__scenarioTool = fmt\n${readFileSync(entry, 'utf8')}`
    )
  }
  // Observes the resolved plugins and bundled module IDs without replacing the preset.
  writeFileSync(
    path.join(app, 'scenario-audit.ts'),
    `import { writeFileSync } from 'node:fs'
export const audit = {
  name: 'scenario-audit',
  configResolved(config) {
    writeFileSync('scenario-config.json', JSON.stringify({plugins: config.plugins.map(p => p.name), tasks: Object.keys(config.run?.tasks ?? {})}))
  },
  generateBundle() {
    writeFileSync('scenario-modules-' + this.environment.name + '.json', JSON.stringify([...this.getModuleIds()]))
  }
}
`
  )
  if (mutation === 'navigation-provider') {
    const generated = path.join(app, 'paraglide')
    cpSync(
      path.join(root, 'packages/solid-runtime/tooling/testing/generated'),
      generated,
      { recursive: true }
    )
    const entry = path.join(
      app,
      'node_modules/@evertondgn/solid-runtime/src/i18n/createLocalizedNavigate/index.ts'
    )
    const runtime = JSON.stringify(path.join(generated, 'runtime.js'))
    writeFileSync(
      entry,
      readFileSync(entry, 'utf8').replace("'../locale/index.ts'", runtime)
    )
  }
  if (mutation === 'locale-provider') {
    const generated = path.join(app, 'paraglide')
    cpSync(path.join(root, 'apps/boilerplate/paraglide'), generated, {
      recursive: true
    })
    const auditFile = path.join(app, 'scenario-audit.ts')
    const runtime = JSON.stringify(path.join(generated, 'runtime.js'))
    writeFileSync(
      auditFile,
      readFileSync(auditFile, 'utf8').replace(
        "name: 'scenario-audit',",
        `name: 'scenario-audit', enforce: 'pre',
      resolveId(id) { if (id === 'virtual:solid-app/locale') return '\\0solid-app:locale-mutant' },
      load(id) { if (id === '\\0solid-app:locale-mutant') return 'export { locales, baseLocale, getLocale, extractLocaleFromUrl, localizeHref, deLocalizeUrl } from ' + ${JSON.stringify(runtime)} },`
      )
    )
  }
  const file = path.join(app, 'vite.config.ts')
  let config = readFileSync(file, 'utf8').replace(
    'export default defineSolidApp(',
    'const application = defineSolidApp('
  )
  config = `import { defineConfig } from 'vite-plus'\nimport { audit } from './scenario-audit.ts'\n${config}\nexport default defineConfig(env => { const config = application(env); return {...config, plugins: [...(config.plugins ?? []), audit]} })\n`
  writeFileSync(file, config)
}
