import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import type { Versions } from './types.ts'

export function rewriteDocuments({
  dir,
  pm,
  version
}: {
  dir: string
  pm: string
  version: string
}): void {
  for (const file of readdirSync(dir, {
    recursive: true,
    encoding: 'utf8'
  }).filter(candidate => candidate.endsWith('.md'))) {
    const target = path.join(dir, file)
    let content = readFileSync(target, 'utf8')
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
    writeFileSync(target, content)
  }
}
export function rewriteKnip(dir: string): void {
  const file = path.join(dir, 'tooling/knip.ts')
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(
      /,\n {2}\/\/ In the monorepo,[\s\S]*?\n\}\)/u,
      '\n})'
    )
  )
}
export function rewritePatchTest({
  dir,
  pm,
  patches
}: {
  dir: string
  pm: string
  patches: Versions
}): void {
  const file = path.join(dir, 'tooling/__tests__/patched-dependencies.test.ts')
  let content = readFileSync(file, 'utf8')
    .replace(/\/\/ In the monorepo,.*\n/u, '')
    .replace('../../../..', '../..')
  if (pm !== 'bun') {
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
  writeFileSync(file, content)
}
