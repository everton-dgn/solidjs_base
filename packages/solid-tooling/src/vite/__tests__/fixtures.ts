import { SOURCE_PACKAGE, HEADERS } from './constants.ts'

const PRESET = new URL('../../../dist/vite.mjs', import.meta.url).href
const SECURITY_HEADERS = {
  ...HEADERS,
  'content-security-policy': "default-src 'self'"
}

// Recorders stand in for the four plugin packages, whose options stay in
// closures. Each module also records that it was imported.
const STUBS = {
  '@inlang/paraglide-js':
    "record('paraglide'); export const paraglideVitePlugin = options => (record('paraglide', options), { name: 'unplugin-paraglide-js' })",
  '@solidjs/vite-plugin':
    "record('solid'); export default options => (record('solid', options), { name: 'solid' })",
  'filesystem-routing/vite':
    "record('fileRoutes'); export const DEFAULT_EXTENSIONS = ['tsx', 'ts']; export const fileRoutes = options => (record('fileRoutes', options), { name: 'fileRoutes' })",
  '@evertondgn/vite-plugin-solid-icons':
    "record('icons'); export const solidIcons = options => { const attributes = {}; options.customizeIcon({ collection: 'collection', name: 'icon', attributes }); record('icons', { ...options, customizeIcon: attributes }); return { name: 'icons' } }",
  'nitro/vite':
    "record('nitro'); export const nitro = options => (record('nitro', { ...options, modules: options.modules.map(module => module.name) }), [{ name: 'nitro' }])"
}

// The config holds plugins, promises and a browser provider, which JSON cannot
// carry, so a child process reports only what the tests check.
export type Scenario = {
  options?: Record<string, unknown>
  mode?: string
  hasExtension?: boolean
  hasStubs?: boolean
  variables?: Record<string, string>
}

export function childScript({
  options = {},
  mode = 'production',
  hasExtension = true,
  hasStubs = true
}: Scenario): string {
  return `
import { registerHooks } from 'node:module'
const record = (name, options) => (globalThis.solidAppCalls ??= []).push(options === undefined ? ['import', name] : [name, options])
globalThis.record = record
const stubs = ${hasStubs ? JSON.stringify(STUBS) : '{}'}
registerHooks({
  resolve(specifier, context, next) {
    const source = stubs[specifier]
    if (source === undefined) return next(specifier, context)
    const url = 'data:text/javascript,' + encodeURIComponent('const { record } = globalThis; ' + source)
    return { url, shortCircuit: true }
  }
})
const extendCalls = []
const extend = context => {
  extendCalls.push(context)
  return {
    plugins: [{ name: 'extension:' + context.target }],
    nitroModules: [{ name: 'extension-module', setup() {} }]
  }
}
const names = async value => {
  const resolved = await value
  if (!resolved) return []
  if (Array.isArray(resolved)) return (await Promise.all(resolved.map(names))).flat()
  return [resolved.name]
}
const summary = { error: null, calls: [], extendCalls, plugins: { app: [], dom: [], browser: [] }, tasks: {}, build: null, server: null, preview: null, setupFiles: [], testEnv: null, test: null }
try {
  const { defineSolidApp } = await import(${JSON.stringify(PRESET)})
  const options = ${JSON.stringify({ securityHeaders: SECURITY_HEADERS, ...options })}
  const app = defineSolidApp(${hasExtension ? '{ ...options, extend }' : 'options'})
  const config = await app({ mode: ${JSON.stringify(mode)}, command: 'build' })
  const [node, dom, browser] = config.test.projects
  const resolver = node.plugins.find(plugin => plugin.name === 'solid-tooling:source-packages')
  summary.plugins = {
    app: (await names(config.plugins)).filter(name => !name.startsWith('vite-plus:')),
    dom: await names(dom.plugins),
    browser: await names(browser.plugins)
  }
  Object.assign(summary, { tasks: config.run.tasks, build: config.build, server: config.server, preview: config.preview, setupFiles: browser.test.setupFiles, testEnv: process.env.SOLID_APP_TEST_PROBE ?? null })
  summary.test = {
    domUrl: dom.test.environmentOptions.happyDOM.url,
    locale: browser.test.browser.provider.options.contextOptions.locale,
    source: (await resolver.resolveId(${JSON.stringify(`${SOURCE_PACKAGE}/headers`)})) ?? null
  }
} catch (error) {
  summary.error = error.message
}
summary.calls = globalThis.solidAppCalls ?? []
process.stdout.write(JSON.stringify(summary))
`
}
