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

import { array, object, parse, record, string } from 'valibot'

import { generate } from '../src/generate.ts'
import { checkImports } from '../tooling/check-imports.ts'
import { uiProfiles } from '../tooling/feature-combinations.ts'

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

function checkCatalogs(dir: string, tree: readonly string[]): void {
  const settingsFile = path.join(dir, 'project.inlang/settings.json')
  const localeSchema = object({ locales: array(string()) })
  const settings = parse(
    localeSchema,
    JSON.parse(readFileSync(settingsFile, 'utf8'))
  )
  const folders = new Set(
    tree
      .filter(file => /\/i18n\/[^/]+\.json$/u.test(file))
      .map(file => path.dirname(file))
  )
  assert.ok(folders.size > 0)
  for (const folder of folders) {
    const jsonFiles = readdirSync(path.join(dir, folder)).filter(file =>
      file.endsWith('.json')
    )
    assert.deepEqual(
      jsonFiles.toSorted(),
      settings.locales.map(locale => `${locale}.json`).toSorted(),
      folder
    )
    let expected: string[] | undefined
    for (const file of jsonFiles) {
      const contents = readFileSync(path.join(dir, folder, file), 'utf8')
      const catalog = parse(record(string(), string()), JSON.parse(contents))
      const keys = Object.keys(catalog).toSorted()
      expected ??= keys
      assert.deepEqual(keys, expected, path.join(folder, file))
    }
  }
}

function checkScriptFiles(dir: string, tree: readonly string[]): void {
  const schema = object({ scripts: record(string(), string()) })
  const manifest = readFileSync(path.join(dir, 'package.json'), 'utf8')
  const { scripts } = parse(schema, JSON.parse(manifest))
  for (const [name, command] of Object.entries(scripts)) {
    for (const match of command.matchAll(
      /(?:^|\s)(?:\.\/)?(?<file>(?:src|tooling)\/[\w./-]+)(?=\s|$)/gu
    )) {
      const file = match.groups?.file
      assert.ok(file && tree.includes(file), `${name} references ${file}`)
    }
  }
}

const terms = array(string())
const inventorySchema = object({
  serverOnly: array(string()),
  forbiddenTerms: object({
    fonts: terms,
    diagnostics: terms,
    icons: terms,
    theme: terms
  })
})
const inventory = parse(
  inventorySchema,
  JSON.parse(readFileSync('features.json', 'utf8'))
)
for (const mode of ['server', 'static'] as const) {
  for (const pm of ['bun', 'npm', 'pnpm'] as const) {
    for (const diagnostics of [true, false]) {
      for (const { fonts, icons, theme } of uiProfiles()) {
        void it(`generates ${mode} ${pm} with theme=${theme}, icons=${icons}, fonts=${fonts} and diagnostics=${diagnostics}`, context => {
          const dir = mkdtempSync(path.join(tmpdir(), 'app-profile-'))
          context.after(() => rmSync(dir, { recursive: true, force: true }))
          generate({
            dir,
            pm,
            mode,
            theme,
            icons,
            diagnostics,
            fonts,
            shouldInstall: false,
            shouldInitGit: false
          })
          const read = (file: string) =>
            readFileSync(path.join(dir, file), 'utf8')
          assert.equal(existsSync(path.join(dir, 'fonts.ts')), fonts)
          assert.equal(read('vite.config.ts').includes('fonts: FONTS'), fonts)
          assert.equal(
            read('src/Document.tsx').includes('<FontLinks />'),
            fonts
          )
          assert.equal(read('docs/ui.md').includes('## Fonts'), fonts)
          if (mode === 'server') {
            assert.equal(read('README.md').includes('Inter subsets'), fonts)
          } else {
            assert.match(read('README.md'), /csp-hashes\.json/u)
            assert.match(read('vite.config.ts'), /output: 'static'/u)
            for (const file of inventory.serverOnly) {
              assert.equal(existsSync(path.join(dir, file)), false, file)
            }
            if (theme) {
              assert.match(
                read('src/constants/theme.ts'),
                /storage: 'local-storage'/u
              )
              assert.match(
                read('docs/ui.md'),
                /reads `app-theme` from local storage/u
              )
            }
            assert.doesNotMatch(
              read('AGENTS.md'),
              /## Server errors and backend calls/u
            )
          }
          assert.equal(
            read('package.json').includes('"@solidjs/diagnostics"'),
            diagnostics
          )
          assert.equal(
            read('docs/development.md').includes('/__solid/diagnostics'),
            diagnostics
          )
          assert.equal(
            read('package.json').includes('@iconify-json/hugeicons'),
            icons
          )
          assert.equal(
            existsSync(path.join(dir, 'src/assets/images/solid.svg')),
            icons
          )
          if (!icons) {
            assert.match(
              read('src/components/organisms/Topbar/index.tsx'),
              />\s*\{SITE_LINKS.repository.label\}\s*<\/a>/u
            )
            assert.match(
              read('src/components/atoms/ToastProvider/index.tsx'),
              />\s*\{m.toast_close\(\)\}\s*<\/button>/u
            )
            assert.match(
              read('src/components/molecules/OutdatedPageNotice/index.tsx'),
              />\s*\{m.outdatedPageNotice_dismiss\(\)\}\s*<\/Button>/u
            )
          }
          assert.equal(
            existsSync(path.join(dir, 'src/constants/theme.ts')),
            theme
          )
          assert.equal(
            read('src/theme/tokens/colors.css').includes('light-dark('),
            theme
          )
          assert.equal(/themeScript/iu.test(read('src/Document.tsx')), theme)
          checkForbiddenTerms(dir, [
            ...(theme ? [] : inventory.forbiddenTerms.theme),
            ...(icons ? [] : inventory.forbiddenTerms.icons),
            ...(fonts ? [] : inventory.forbiddenTerms.fonts),
            ...(diagnostics ? [] : inventory.forbiddenTerms.diagnostics)
          ])
          const tree = readdirSync(dir, {
            recursive: true,
            withFileTypes: true
          })
            .filter(file => file.isFile())
            .map(file =>
              path.relative(dir, path.join(file.parentPath, file.name))
            )
          checkImports(dir, tree)
          checkScriptFiles(dir, tree)
          checkCatalogs(dir, tree)
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
}
