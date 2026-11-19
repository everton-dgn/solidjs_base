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
import { checkImports } from '../tooling/check-imports.ts'
import { guideOwnership } from '../tooling/guide-ownership.ts'
import { guideProblems } from '../tooling/guide-problems.ts'
import { uiProfiles } from '../tooling/ui-profiles.ts'

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
    identity: terms,
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
  hasSeo: boolean
  theme: boolean
  icons: boolean
  fonts: boolean
}): Set<string> {
  const disabled = new Set<string>(
    profile.hasSeo ? [] : ['seo', 'publication', 'sitemap', 'markdown']
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
  hasSeo: boolean
}
function checkGuideContent({ dir, mode, pm, hasSeo }: GuideProfile): void {
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
  if (mode === 'static' && !hasSeo) {
    assert.ok(!read('tooling/knip.ts').includes("'server-only'"))
  }
  assert.match(read('docs/development.md'), /^## Execution and cache$/mu)
  if (mode === 'static' && hasSeo) {
    assert.match(read('docs/seo.md'), /^## Structured data per page$/mu)
    assert.match(read('docs/seo/sitemap.md'), /^### Partitioned sources$/mu)
    assert.match(read('docs/seo/indexes.md'), /llms: false/u)
    assert.match(
      read('docs/seo/publication.md'),
      /## Capacity and measurement/u
    )
    assert.match(read('docs/seo/markdown.md'), /llms-full\.txt/u)
  }
  for (const convention of [
    'File and folder names of modules',
    'TypeScript types',
    'Type location',
    'Cohesion and size of modules',
    'Function parameters',
    'Events in JSX',
    'Conditionals and control flow',
    'Exports',
    'Functions that return a Promise',
    'Code comments',
    'Boolean names',
    'Signal names'
  ]) {
    assert.ok(
      read('AGENTS.md').split('\n').includes(`## ${convention}`),
      convention
    )
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
function checkFavicons({
  dir,
  mode
}: Pick<GuideProfile, 'dir' | 'mode'>): void {
  const source = mode === 'client' ? 'index.html' : 'src/Document.tsx'
  const document = readFileSync(path.join(dir, source), 'utf8')
  for (const [rel, file] of [
    ['icon', 'favicon.ico'],
    ['icon', 'favicon.svg'],
    ['apple-touch-icon', 'apple-touch-icon.png']
  ] as const) {
    assert.ok(
      document
        .match(/<link\s[^>]*>/gu)
        ?.some(
          link =>
            link.includes(`rel="${rel}"`) &&
            link.includes(`href="/favicon/${file}"`)
        ),
      file
    )
  }
}
const guideChanges = guideOwnership()
const approvedEdits = new Set(
  readFileSync('guide-edits.txt', 'utf8').trimEnd().split('\n')
)
const observedEdits = new Set<string>()
const modes = ['server', 'static', 'client'] as const
const publications = modes.flatMap(mode =>
  [true, false].map(hasSeo => ({ mode, hasSeo }))
)
for (const { mode, hasSeo } of publications) {
  for (const pm of ['bun', 'npm', 'pnpm'] as const) {
    for (const diagnostics of [true, false]) {
      for (const { fonts, icons, theme } of uiProfiles()) {
        void it(`generates ${mode} ${pm} with seo=${hasSeo}, theme=${theme}, icons=${icons}, fonts=${fonts} and diagnostics=${diagnostics}`, context => {
          const dir = mkdtempSync(path.join(tmpdir(), 'app-profile-'))
          context.after(() => rmSync(dir, { recursive: true, force: true }))
          const profile = {
            title: 'Solid Base application',
            dir,
            pm,
            mode,
            hasSeo,
            hasTheme: theme,
            hasIcons: icons,
            hasDiagnostics: diagnostics,
            hasFonts: fonts,
            shouldInstall: false,
            shouldInitGit: false
          }
          if (mode === 'client' && hasSeo) {
            assert.throws(() => generate(profile), /--mode static/u)
            assert.deepEqual(readdirSync(dir), [])
            return
          }
          generate(profile)
          const read = (file: string) =>
            readFileSync(path.join(dir, file), 'utf8')
          for (const change of guideChanges(profile)) {
            observedEdits.add(change)
            assert.ok(
              approvedEdits.has(change),
              `Unreviewed guide edit: ${change}`
            )
          }
          checkGuideContent({ dir, mode, pm, hasSeo })
          assert.match(read('package.json'), /"test:tooling":/u)
          assert.match(read('AGENTS.md'), /^## CSS classes$/mu)
          assert.match(read('AGENTS.md'), /^## Exports$/mu)
          assert.equal(read('.env').includes('VITE_SITE_URL='), hasSeo)
          if (!hasSeo) {
            assert.ok(!read('vite.config.ts').includes('publicAssets:'))
          }
          if (!theme) assert.ok(!read('README.md').includes('<picture>'))
          assert.equal(existsSync(path.join(dir, 'fonts.ts')), fonts)
          assert.equal(read('vite.config.ts').includes('fonts: FONTS'), fonts)
          if (mode !== 'client') {
            assert.equal(
              read('src/Document.tsx').includes('<FontLinks />'),
              fonts
            )
          }
          checkFavicons({ dir, mode })
          assert.equal(read('docs/ui.md').includes('## Fonts'), fonts)
          if (mode === 'server' && hasSeo) {
            assert.equal(read('README.md').includes('Inter subsets'), fonts)
          }
          if (mode === 'client') {
            assert.match(read('vite.config.ts'), /ssr: false/u)
            assert.ok(existsSync(path.join(dir, 'index.html')))
            assert.ok(!existsSync(path.join(dir, 'src/entry-server.tsx')))
          }
          if (mode === 'static') {
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
            hasSeo
          )
          assert.equal(read('package.json').includes('schema-dts'), hasSeo)
          if (mode !== 'client') {
            assert.equal(/themeScript/iu.test(read('src/Document.tsx')), theme)
          }
          checkForbiddenTerms(dir, [
            ...inventory.forbiddenTerms.identity,
            ...(hasSeo ? [] : inventory.forbiddenTerms.seo),
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
            knownImports: importsFor({ hasSeo, theme, fonts, icons })
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

void it('requires every guide approval to describe an observed edit', () => {
  assert.deepEqual(
    [...approvedEdits].filter(line => !observedEdits.has(line)),
    []
  )
})

const repetitions = 15
for (const title of [
  String.raw`Été " ' < & \ \` #`,
  'Um título comprido '.repeat(repetitions).trim()
]) {
  void it(`escapes and formats a client application named ${title}`, async context => {
    const dir = mkdtempSync(path.join(tmpdir(), 'app-title-'))
    context.after(() => rmSync(dir, { recursive: true, force: true }))
    generate({
      dir,
      title,
      mode: 'client',
      pm: 'bun',
      shouldInstall: false,
      shouldInitGit: false
    })
    const module: unknown = await import(
      path.join(dir, 'src/constants/site/title.ts')
    )
    const siteSchema = object({ title: string() })
    const { SITE } = parse(object({ SITE: siteSchema }), module)
    assert.equal(SITE.title, title)
    const source = readFileSync(
      path.join(dir, 'src/routes/(base)/(home)/i18n/en.json'),
      'utf8'
    )
    const catalog = parse(record(string(), string()), JSON.parse(source))
    assert.equal(catalog.home_seoTitle, `${title} | Web applications`)
    assert.equal(catalog.home_title, `${title} for web applications`)
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
