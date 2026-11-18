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
      content = content
        .replace(
          /^# Boilerplate app[\s\S]*?(?=> \[!NOTE\])/u,
          '# Solid Base application\n\nThis application uses SolidJS 2 with the Solid Base tooling and runtime. Run `vp run dev` to start it locally.\n\n'
        )
        .replace(/## Who it fits[\s\S]*?(?=## Running it)/u, '')
        .replace(
          /You need the global[\s\S]*?(?=```bash\nvp run test:browser:install)/u,
          `Install the global [Vite+](https://viteplus.dev/guide/) CLI and Bun. Run \`${pm} install\` from this directory if dependencies are missing. Install Chromium once for the browser tests:\n\n`
        )
        .replace(
          "CI runs this app's check",
          "The upstream boilerplate CI runs the app's check"
        )
        .replace(
          'The app started as a copy of',
          'The upstream boilerplate started as a copy of'
        )
        .replace('the copy exists.', 'the upstream copy exists.')
        .replace(
          /- The copy installs the packages from the workspace,[\s\S]*?(?=- The guides describe)/u,
          `- Bun is required to run the application tasks. ${
            pm === 'npm'
              ? 'npm installs the upstream Markdown converter without the patch.'
              : 'The installer applies the Markdown converter patch.'
          }\n`
        )
        .replace(', through the\nworkspace,', ',')
        .replace(
          /The manifest declares both packages as .+?repository raises them with/su,
          'Update the installed packages with'
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
