/* oxlint-disable node/no-sync -- Mutations only touch an owned temporary application and its installed packages. */
import assert from 'node:assert/strict'
import { cpSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

type SourceMutation = { app: string; mutation: string | undefined }
type Instrumentation = SourceMutation & { root: string }
type MiddlewareInstrumentation = SourceMutation & { scenario: string }

export function instrumentMiddleware({
  app,
  scenario,
  mutation
}: MiddlewareInstrumentation): void {
  if (scenario === 'client-only') return
  const entry = path.join(app, 'src/middleware.ts')
  const source = readFileSync(entry, 'utf8')
  assert.ok(source.includes('security: createSecurityHeaders()'))
  writeFileSync(
    entry,
    `import type { Middleware } from '@evertondgn/solid-runtime/middleware/types'
const probe: Middleware = async (request, next) => {
  const failure = new URL(request.url).searchParams.get('middleware-error')
  if (!failure) return next()
  if (failure === 'control') throw Response.redirect(new URL('/destination', request.url), 307)
  if (failure === 'after') await next()
  throw Object.assign(new Error('MESSAGE_PRIVATE_SCENARIO_MIDDLEWARE', { cause: new Error('CAUSE_PRIVATE_SCENARIO_MIDDLEWARE') }), { privateContext: 'PROPERTY_PRIVATE_SCENARIO_MIDDLEWARE' })
}
${source.replace('security: createSecurityHeaders()', 'security: createSecurityHeaders(), extra: [probe]')}`
  )
  const directory = path.join(
    app,
    'node_modules/@evertondgn/solid-runtime/src/middleware'
  )
  if (mutation === 'middleware-body') {
    const file = path.join(directory, 'containFailures/index.ts')
    const containment = readFileSync(file, 'utf8')
    assert.ok(containment.includes('if (import.meta.env.DEV) throw error'))
    writeFileSync(
      file,
      containment.replace(
        'if (import.meta.env.DEV) throw error',
        'if (error instanceof Error) return new Response(error.message, { status: 500 }); if (import.meta.env.DEV) throw error'
      )
    )
  }
  if (mutation === 'middleware-headers') {
    const file = path.join(directory, 'containFailures/index.ts')
    const containment = readFileSync(file, 'utf8')
    assert.ok(containment.includes('return applySecurityHeaders('))
    writeFileSync(
      file,
      containment.replace(
        'return applySecurityHeaders(',
        'return ((response: Response) => response)('
      )
    )
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
