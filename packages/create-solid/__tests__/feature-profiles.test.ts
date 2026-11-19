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

import {
  CSP_DIRECTIVES,
  SECURITY_HEADERS
} from '../../solid-runtime/src/middleware/securityHeaders/constants.js'
import { createTasks } from '../../solid-tooling/src/vite/tasks.ts'
import { generate } from '../src/generate.ts'
import { guideFiles } from '../src/prepared-guides.ts'
import { guideProblems } from '../tooling/check-guide-links.ts'
import { checkImports } from '../tooling/check-imports.ts'
import { uiProfiles } from '../tooling/feature-combinations.ts'
import { guideOwnership } from '../tooling/guide-ownership.ts'

function checkForbiddenTerms(dir: string, terms: string[]): void {
  if (terms.length === 0) return
  for (const file of readdirSync(dir, {
    recursive: true,
    withFileTypes: true
  })) {
    if (!file.isFile()) continue
    const target = path.join(file.parentPath, file.name)
    const source = readFileSync(target, 'utf8')
    const mimeExamples: Record<string, string> = {
      'README.md': 'Content-Type: text/markdown; charset=utf-8',
      'tooling/testing/serve-public.ts': "'.md': 'text/markdown; charset=utf-8'"
    }
    const mime = mimeExamples[path.relative(dir, target)]
    const content = mime === undefined ? source : source.replace(mime, '')
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
      assert.ok(keys.length > 0, path.join(folder, file))
      expected ??= keys
      assert.deepEqual(keys, expected, path.join(folder, file))
    }
  }
}

function checkScriptFiles(dir: string, tree: readonly string[]): void {
  const schema = object({ scripts: record(string(), string()) })
  const manifest = readFileSync(path.join(dir, 'package.json'), 'utf8')
  const { scripts } = parse(schema, JSON.parse(manifest))
  const tasks = createTasks({ root: dir, isCi: true, hasI18n: true })
  for (const [name, command] of Object.entries(scripts)) {
    for (const match of command.matchAll(/\bvp run (?<task>[\w:-]+)/gu)) {
      const target = match.groups?.task
      assert.ok(
        target &&
          (Object.hasOwn(scripts, target) || Object.hasOwn(tasks, target)),
        `${name} invokes missing task ${target}`
      )
    }
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
  imports: record(string(), string()),
  serverOnly: array(string()),
  forbiddenTerms: object({
    static: terms,
    client: terms,
    fonts: terms,
    seo: terms,
    diagnostics: terms,
    icons: terms,
    theme: terms
  })
})
const inventory = parse(
  inventorySchema,
  JSON.parse(readFileSync('features.json', 'utf8'))
)
function importsFor(profile: {
  seo: boolean
  theme: boolean
  icons: boolean
  fonts: boolean
}): Set<string> {
  const disabled = new Set<string>(
    profile.seo ? [] : ['seo', 'publication', 'sitemap', 'markdown']
  )
  if (!profile.fonts) disabled.add('fonts')
  if (!profile.theme) disabled.add('theme')
  if (!profile.icons) disabled.add('icons')
  return new Set(
    Object.entries(inventory.imports)
      .filter(([, owner]) => !disabled.has(owner))
      .map(([source]) => source)
  )
}
type GuideProfile = {
  dir: string
  mode: 'server' | 'static' | 'client'
  pm: string
  seo: boolean
}
function checkGuideContent({ dir, mode, pm, seo }: GuideProfile): void {
  const read = (file: string) => readFileSync(path.join(dir, file), 'utf8')
  if (
    mode === 'client' &&
    existsSync(path.join(dir, 'src/constants/theme.ts'))
  ) {
    assert.doesNotMatch(
      read('src/constants/theme.ts'),
      /themeColor|DEFAULT_THEME/u
    )
  }
  if (mode === 'static' && !seo) {
    assert.ok(!read('tooling/knip.ts').includes("'server-only'"))
  }
  const readme = read('README.md')
  assert.ok(readme.includes(`${pm} install`))
  if (mode !== 'server') {
    for (const file of ['AGENTS.md', ...guideFiles(dir)]) {
      const guide = read(file).toLowerCase()
      for (const term of inventory.forbiddenTerms[mode]) {
        assert.ok(
          !guide.includes(term.toLowerCase()),
          `${file} mentions ${term}`
        )
      }
    }
    for (const directive of CSP_DIRECTIVES) {
      assert.ok(readme.includes(directive), directive)
    }
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      assert.ok(readme.includes(`${name}: ${value}`), name)
    }
    assert.equal(readme.includes('{page-hashes}'), mode === 'static')
    assert.ok(readme.includes('text/markdown; charset=utf-8'))
  }
}
const guideChanges = guideOwnership()
const approvedEdits = new Set(
  readFileSync('guide-edits.txt', 'utf8').trimEnd().split('\n')
)
const modes = ['server', 'static', 'client'] as const
const publications = modes.flatMap(mode =>
  [true, false].map(seo => ({ mode, seo }))
)
for (const { mode, seo } of publications) {
  for (const pm of ['bun', 'npm', 'pnpm'] as const) {
    for (const diagnostics of [true, false]) {
      for (const { fonts, icons, theme } of uiProfiles()) {
        void it(`generates ${mode} ${pm} with seo=${seo}, theme=${theme}, icons=${icons}, fonts=${fonts} and diagnostics=${diagnostics}`, context => {
          const dir = mkdtempSync(path.join(tmpdir(), 'app-profile-'))
          context.after(() => rmSync(dir, { recursive: true, force: true }))
          const profile = {
            dir,
            pm,
            mode,
            hasSeo: seo,
            hasTheme: theme,
            hasIcons: icons,
            hasDiagnostics: diagnostics,
            hasFonts: fonts,
            shouldInstall: false,
            shouldInitGit: false
          }
          if (mode === 'client' && seo) {
            assert.throws(() => generate(profile), /--mode static/u)
            assert.deepEqual(readdirSync(dir), [])
            return
          }
          generate(profile)
          const read = (file: string) =>
            readFileSync(path.join(dir, file), 'utf8')
          for (const change of guideChanges(profile)) {
            assert.ok(
              approvedEdits.has(change),
              `Unreviewed guide edit: ${change}`
            )
          }
          checkGuideContent({ dir, mode, pm, seo })
          assert.match(read('package.json'), /"test:tooling":/u)
          assert.match(read('AGENTS.md'), /^## CSS classes$/mu)
          assert.match(read('AGENTS.md'), /^## Exports$/mu)
          assert.equal(read('.env').includes('VITE_SITE_URL='), seo)
          if (!seo) assert.ok(!read('vite.config.ts').includes('publicAssets:'))
          if (!theme) assert.ok(!read('README.md').includes('<picture>'))
          assert.equal(existsSync(path.join(dir, 'fonts.ts')), fonts)
          assert.equal(read('vite.config.ts').includes('fonts: FONTS'), fonts)
          if (mode !== 'client') {
            assert.equal(
              read('src/Document.tsx').includes('<FontLinks />'),
              fonts
            )
          }
          assert.equal(read('docs/ui.md').includes('## Fonts'), fonts)
          if (mode === 'server' && seo) {
            assert.equal(read('README.md').includes('Inter subsets'), fonts)
          } else if (mode === 'client') {
            assert.match(read('vite.config.ts'), /ssr: false/u)
            assert.ok(existsSync(path.join(dir, 'index.html')))
            assert.ok(!existsSync(path.join(dir, 'src/entry-server.tsx')))
          } else if (mode === 'static') {
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
          assert.equal(
            existsSync(path.join(dir, 'src/primitives/createSeo/index.ts')),
            seo
          )
          assert.equal(read('package.json').includes('schema-dts'), seo)
          if (mode !== 'client') {
            assert.equal(/themeScript/iu.test(read('src/Document.tsx')), theme)
          }
          checkForbiddenTerms(dir, [
            ...(seo ? [] : inventory.forbiddenTerms.seo),
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
          checkImports({
            dir,
            files: tree,
            knownImports: importsFor({ seo, theme, fonts, icons })
          })
          assert.deepEqual(guideProblems(dir), [])
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
