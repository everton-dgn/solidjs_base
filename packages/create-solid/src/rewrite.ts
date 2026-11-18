import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import type { DocumentRewrite, PatchRewrite } from './types.ts'

function format(file: string, content: string): string {
  return execFileSync('vp', ['fmt', `--stdin-filepath=${file}`], {
    cwd: path.join(import.meta.dirname, '../dist/formatter'),
    input: content,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  })
}
export function rewriteDocuments({ dir, pm, version }: DocumentRewrite): void {
  for (const file of readdirSync(dir, {
    recursive: true,
    encoding: 'utf8'
  }).filter(candidate => candidate.endsWith('.md'))) {
    const target = path.join(dir, file)
    const source = readFileSync(target, 'utf8')
    let content = source
    if (file === 'README.md') {
      assert.ok(content.includes('dependencies with `vp install`'))
      content = content.replace(
        'dependencies with `vp install`',
        `dependencies with \`${pm} install\``
      )
      const policy =
        'The installer determines whether the Markdown converter patch is applied.'
      assert.ok(content.includes(policy))
      content = content.replace(
        policy,
        pm === 'npm'
          ? 'npm installs the upstream Markdown converter.'
          : 'The installer applies the Markdown converter patch.'
      )
    }
    content = content.replaceAll(
      /(?:\]\(|(?:src|srcset)=")\.\.\/[^)"\s]+/gu,
      match => {
        const split = match.indexOf('..')
        const prefix = match.slice(0, split)
        const href = match.slice(split)
        const location = path.posix.normalize(
          path.posix.join('apps/boilerplate', path.dirname(file), href)
        )
        if (location.startsWith('apps/boilerplate/')) return match
        const view = prefix === '](' ? 'blob' : 'raw'
        return `${prefix}https://github.com/everton-dgn/solidjs_base/${
          view
        }/create-solid@${version}/${location}`
      }
    )
    if (source !== content) {
      writeFileSync(
        target,
        file === 'AGENTS.md' ? content : format(file, content)
      )
    }
  }
}
export function rewriteKnip(dir: string): void {
  const file = path.join(dir, 'tooling/knip.ts')
  const source = readFileSync(file, 'utf8')
  const output = source.replace(
    /,\n {2}\/\/ In the monorepo,[\s\S]*?\n\}\)/u,
    '\n})'
  )
  assert.notEqual(output, source, 'Missing Knip workspace inputs')
  writeFileSync(file, output)
}
export function rewritePatchTest({ dir, pm, patches }: PatchRewrite): void {
  const file = path.join(dir, 'tooling/__tests__/patched-dependencies.test.ts')
  const source = readFileSync(file, 'utf8')
  assert.match(source, /\/\/ In the monorepo,.*\n/u)
  assert.ok(source.includes('../../../..'))
  let content = source
    .replace(/\/\/ In the monorepo,.*\n/u, '')
    .replace('../../../..', '../..')
  if (pm !== 'bun') {
    assert.ok(content.includes('const patchesSchema'))
    assert.ok(content.includes("import * as v from 'valibot'\n\n"))
    const [entry] = Object.entries(patches)
    assert.ok(entry)
    const [key, patch] = entry
    const lines =
      pm === 'npm'
        ? [
            "  const manifest: unknown = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'))",
            "  assert.ok(typeof manifest === 'object' && manifest !== null && !('patchedDependencies' in manifest))",
            `  await assert.rejects(access(path.join(ROOT, ${JSON.stringify(
              patch
            )})), { code: 'ENOENT' })`
          ]
        : [
            "  const workspace = await readFile(path.join(ROOT, 'pnpm-workspace.yaml'), 'utf8')",
            "  const lock = await readFile(path.join(ROOT, 'pnpm-lock.yaml'), 'utf8')",
            `  assert.ok(workspace.includes(${JSON.stringify(key)}))`,
            `  assert.ok(lock.includes(${JSON.stringify(key)}))`,
            `  await access(path.join(ROOT, ${JSON.stringify(patch)}))`
          ]
    content = `${content
      .slice(0, content.indexOf('const patchesSchema'))
      .replace(
        "import * as v from 'valibot'\n\n",
        ''
      )}\nit('checks the installed Markdown converter patch policy', async () => {\n${lines.join(
      '\n'
    )}\n})\n`
  }
  writeFileSync(file, format('patched-dependencies.test.ts', content))
}
