import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { editTemplate } from './edit-template.ts'
import type { Profile } from './types.ts'

type PatchRewrite = Pick<Profile, 'pm' | 'dir'>
type DocumentRewrite = PatchRewrite & { version: string }

export function format(file: string, content: string): string {
  return execFileSync(
    path.resolve(import.meta.dirname, '../../../node_modules/.bin/vp'),
    ['fmt', `--stdin-filepath=${file}`],
    {
      cwd: path.join(import.meta.dirname, '../dist/formatter'),
      input: content,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }
  )
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
      content = editTemplate({
        file,
        text: content,
        pattern: 'dependencies with `vp install`',
        replacement: `dependencies with \`${pm} install\``
      })
      content = editTemplate({
        file,
        text: content,
        pattern:
          'The installer determines whether the Markdown converter patch is applied.',
        replacement:
          pm === 'npm'
            ? 'npm installs the upstream Markdown converter.'
            : 'The installer applies the Markdown converter patch.'
      })
    }
    const references = content.matchAll(
      /(?:\]\(|(?:src|srcset)=")\.\.\/[^)"\s]+/gu
    )
    for (const [match] of references) {
      const split = match.indexOf('..')
      const prefix = match.slice(0, split)
      const location = path.posix.normalize(
        path.posix.join(
          'apps/boilerplate',
          path.dirname(file),
          match.slice(split)
        )
      )
      if (location.startsWith('apps/boilerplate/')) continue
      const view = prefix === '](' ? 'blob' : 'raw'
      content = editTemplate({
        file,
        text: content,
        pattern: match,
        replacement: () =>
          `${prefix}https://github.com/everton-dgn/solidjs_base/${view}/create-solid@${version}/${location}`
      })
    }
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
  const output = editTemplate({
    file,
    text: source,
    pattern: /,\n {2}\/\/ In the monorepo,[\s\S]*?\n\}\)/u,
    replacement: '\n})',
    missing: 'Missing Knip workspace inputs'
  })
  writeFileSync(file, output)
}
export function rewritePatchTest({ dir, pm }: PatchRewrite): void {
  const file = path.join(dir, 'tooling/__tests__/patched-dependencies.test.ts')
  const source = readFileSync(file, 'utf8')
  let content = editTemplate({
    file,
    text: source,
    pattern: /\/\/ In the monorepo,.*\n/u,
    replacement: ''
  })
  content = editTemplate({
    file,
    text: content,
    pattern: '../../../..',
    replacement: '../..'
  })
  if (pm !== 'bun') {
    assert.ok(content.includes('const patchesSchema'))
    assert.ok(content.includes("import * as v from 'valibot'\n\n"))
    const lines =
      pm === 'npm'
        ? [
            "  const manifest: unknown = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'))",
            "  assert.ok(typeof manifest === 'object' && manifest !== null && !('patchedDependencies' in manifest))",
            "  await assert.rejects(access(path.join(ROOT, 'patches')), { code: 'ENOENT' })"
          ]
        : [
            "  const lock = await readFile(path.join(ROOT, 'pnpm-lock.yaml'), 'utf8')",
            "  const { stdout: decoded } = await promisify(execFile)('bun', ['-p', `JSON.stringify(Bun.YAML.parse(await Bun.file('pnpm-workspace.yaml').text()).patchedDependencies)`], { cwd: ROOT })",
            '  const patches: unknown = JSON.parse(decoded)',
            "  assert.ok(patches !== null && typeof patches === 'object' && !Array.isArray(patches))",
            '  const entries = Object.entries(patches)',
            '  assert.ok(entries.length > 0)',
            '  for (const [key, file] of entries) {',
            "    assert.ok(typeof file === 'string' && lock.includes(key))",
            '    await access(path.join(ROOT, file))',
            '  }'
          ]
    const preamble = editTemplate({
      file,
      text: content,
      pattern: /const patchesSchema[\s\S]*$/u,
      replacement: ''
    })
    const imports = editTemplate({
      file,
      text: preamble,
      pattern: "import * as v from 'valibot'\n\n",
      replacement:
        pm === 'pnpm'
          ? "import { execFile } from 'node:child_process'\nimport { promisify } from 'node:util'\n\n"
          : ''
    })
    content = `${imports}\nit('checks the installed Markdown converter patch policy', async () => {\n${lines.join(
      '\n'
    )}\n})\n`
  }
  writeFileSync(file, format('patched-dependencies.test.ts', content))
}

export function rewriteVite(dir: string): void {
  const file = path.join(dir, 'vite.config.ts')
  const vite = readFileSync(file, 'utf8')
  const output = editTemplate({
    file,
    text: vite,
    pattern: /,\n {2}\/\/ In the monorepo,[\s\S]+?\n {2}\}\n\}\)/u,
    replacement: '\n})',
    missing: 'Missing Vite workspace inputs'
  })
  writeFileSync(file, output)
}
