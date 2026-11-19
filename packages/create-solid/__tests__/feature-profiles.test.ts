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

import { generate } from '../src/generate.ts'

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
