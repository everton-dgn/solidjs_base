import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  readdirSync,
  mkdtempSync,
  readFileSync,
  rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { it } from 'node:test'

import { array, object, parse, string } from 'valibot'

import { generate } from '../src/generate.ts'
import { checkImports } from '../tooling/check-imports.ts'

function checkForbiddenTerms(dir: string, terms: string[]): void {
  if (terms.length === 0) return
  for (const file of readdirSync(dir, {
    recursive: true,
    withFileTypes: true
  })) {
    if (!file.isFile()) continue
    const target = path.join(file.parentPath, file.name)
    const content = readFileSync(target, 'utf8')
    for (const term of terms) {
      assert.ok(!content.includes(term), `${target} mentions ${term}`)
    }
  }
}

const terms = array(string())
const inventorySchema = object({
  forbiddenTerms: object({ fonts: terms, diagnostics: terms })
})
const inventory = parse(
  inventorySchema,
  JSON.parse(readFileSync('features.json', 'utf8'))
)
for (const pm of ['bun', 'npm', 'pnpm'] as const) {
  for (const diagnostics of [true, false]) {
    for (const fonts of [true, false]) {
      void it(`generates ${pm} with fonts=${fonts} and diagnostics=${diagnostics}`, context => {
        const dir = mkdtempSync(path.join(tmpdir(), 'app-profile-'))
        context.after(() => rmSync(dir, { recursive: true, force: true }))
        generate({
          dir,
          pm,
          diagnostics,
          fonts,
          shouldInstall: false,
          shouldInitGit: false
        })
        const read = (file: string) =>
          readFileSync(path.join(dir, file), 'utf8')
        assert.equal(existsSync(path.join(dir, 'fonts.ts')), fonts)
        assert.equal(read('vite.config.ts').includes('fonts: FONTS'), fonts)
        assert.equal(read('src/Document.tsx').includes('<FontLinks />'), fonts)
        assert.equal(read('docs/ui.md').includes('## Fonts'), fonts)
        assert.equal(read('README.md').includes('Inter subsets'), fonts)
        assert.equal(
          read('package.json').includes('"@solidjs/diagnostics"'),
          diagnostics
        )
        assert.equal(
          read('docs/development.md').includes('/__solid/diagnostics'),
          diagnostics
        )
        checkForbiddenTerms(dir, [
          ...(fonts ? [] : inventory.forbiddenTerms.fonts),
          ...(diagnostics ? [] : inventory.forbiddenTerms.diagnostics)
        ])
        const tree = readdirSync(dir, { recursive: true, withFileTypes: true })
          .filter(file => file.isFile())
          .map(file =>
            path.relative(dir, path.join(file.parentPath, file.name))
          )
        checkImports(dir, tree)
        const files = readdirSync(dir)
        copyFileSync(
          'dist/formatter/vite.config.mjs',
          path.join(dir, 'fmt.config.mjs')
        )
        execFileSync(
          path.resolve('../../node_modules/.bin/vp'),
          ['fmt', '--config', 'fmt.config.mjs', '--check', ...files],
          { cwd: dir }
        )
      })
    }
  }
}
