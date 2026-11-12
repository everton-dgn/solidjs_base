/* oxlint-disable node/no-sync -- A fixture é montada em sequência e o teste aguarda o CLI real. */
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { TestContext } from 'node:test'

type LintFixture = {
  context: TestContext
  sources: Record<string, string>
  config?: string
}

const ROOT = path.resolve(import.meta.dirname, '../../..')
const WORKSPACE_ROOT = path.resolve(ROOT, '../..')
// O lint do projeto vem de ./tooling, ligado aos fontes do pacote. Os plugins
// chegam pelo especificador do pacote, resolvido no node_modules do workspace,
// que aponta para o dist: a suíte depende do build.
const LINK_TARGETS: Record<string, string> = {
  node_modules: path.join(WORKSPACE_ROOT, 'node_modules'),
  tooling: path.join(ROOT, 'src')
}
const PROJECT_LINT_CONFIG =
  'import { lint } from "./tooling/lint.ts"; export default { lint: { ...lint, options: { typeAware: false, typeCheck: false } } }'

export function lintFixture({
  context,
  sources,
  config
}: LintFixture): SpawnSyncReturns<string> {
  const directory = mkdtempSync(path.join(tmpdir(), 'solid-lint-fixture-'))
  // Sandbox criado pelo próprio teste: a remoção direta é o descarte correto.
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const links =
    config === undefined ? ['node_modules', 'tooling'] : ['node_modules']
  for (const name of links) {
    const target = LINK_TARGETS[name]
    if (target === undefined) throw new Error(`Link sem destino: ${name}`)
    symlinkSync(target, path.join(directory, name), 'dir')
  }
  writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({ type: 'module' }),
    { flag: 'wx' }
  )
  writeFileSync(
    path.join(directory, 'vite.config.ts'),
    config ?? PROJECT_LINT_CONFIG,
    { flag: 'wx' }
  )
  for (const [filename, source] of Object.entries(sources)) {
    // Com o lint do projeto, tooling aponta para o repositório real.
    if (config === undefined && filename.startsWith('tooling/')) {
      throw new Error(`${filename} exige uma config própria na fixture.`)
    }
    const destination = path.join(directory, filename)
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, source, { flag: 'wx' })
  }
  return spawnSync(
    path.join(WORKSPACE_ROOT, 'node_modules/.bin/vp'),
    ['lint', ...Object.keys(sources), '--format', 'json'],
    { cwd: directory, encoding: 'utf8', timeout: 30_000 }
  )
}
