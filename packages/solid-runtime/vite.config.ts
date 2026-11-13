import { defineConfig, type Plugin } from 'vite-plus'

const STUB_PREFIX = '\0solid-runtime-stub:'
// The stand-ins that solidTest serves to the node project of an application:
// the Solid and routing plugins provide these modules only in a real build.
const NODE_STUBS = new Map([
  ['server-only', 'export default undefined'],
  ['virtual:file-routes', 'export const pageRoutes = []\nexport default []'],
  [
    'virtual:solid-server-function-handler',
    "export const endpoint = '/_server'"
  ]
])

function nodeStubs(): Plugin {
  return {
    name: 'solid-runtime:node-stubs',
    enforce: 'pre',
    resolveId: id => (NODE_STUBS.has(id) ? `${STUB_PREFIX}${id}` : undefined),
    load: id =>
      id.startsWith(STUB_PREFIX)
        ? NODE_STUBS.get(id.slice(STUB_PREFIX.length))
        : undefined
  }
}

export default defineConfig({
  plugins: [nodeStubs()],
  test: {
    pool: 'threads',
    globals: true,
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    expect: { requireAssertions: true, poll: { interval: 10 } },
    environment: 'node',
    include: ['src/**/*.node.test.{ts,tsx}'],
    // The thresholds and exclusions that solidTest gives to an application.
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/{constants,types}.{ts,tsx}',
        'src/**/__tests__/**'
      ]
    }
  }
})
