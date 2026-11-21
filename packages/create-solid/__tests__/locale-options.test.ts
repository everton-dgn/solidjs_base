import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { it } from 'node:test'

import {
  catalogFolders,
  readLocaleSettings
} from '../src/configureLocales/catalogs.ts'
import {
  questionnaireBase,
  resolveLocaleOptions
} from '../src/resolve-locale-options.ts'
import type { Profile } from '../src/types.ts'

process.env.LC_ALL = 'C'

const usageExitCode = 2
const defaults = { baseLocale: 'en', locales: ['pt', 'en', 'es'] }
const resolve = (options: Partial<Profile>) =>
  resolveLocaleOptions({ options, defaults })

for (const [language, baseLocale] of [
  ['pt-BR', 'pt'],
  ['en', 'en'],
  ['es', 'es']
] as const) {
  void it(`uses the ${language} questionnaire language in generated applications`, context => {
    const root = mkdtempSync(path.join(tmpdir(), 'solid-default-language-'))
    context.after(() => rmSync(root, { recursive: true, force: true }))
    for (const mode of ['server', 'static', 'client']) {
      const dir = path.join(root, mode)
      const result = spawnSync(
        process.execPath,
        [
          'src/create-solid.ts',
          dir,
          '--yes',
          '--no-git',
          '--no-install',
          '--mode',
          mode,
          '--lang',
          language
        ],
        { encoding: 'utf8' }
      )
      assert.equal(result.status, 0, result.stderr)
      assert.deepEqual(readLocaleSettings(dir), {
        baseLocale,
        locales: mode === 'client' ? [baseLocale] : defaults.locales
      })
    }
  })
}

void it('uses the machine language for unattended creation', context => {
  const root = mkdtempSync(path.join(tmpdir(), 'solid-machine-language-'))
  context.after(() => rmSync(root, { recursive: true, force: true }))
  for (const [name, flags, ci] of [
    ['redirected', [], ''],
    ['disabled', ['--no-interactive'], ''],
    ['ci', [], 'true']
  ] as const) {
    const dir = path.join(root, name)
    const result = spawnSync(
      process.execPath,
      ['src/create-solid.ts', dir, ...flags, '--no-install', '--no-git'],
      {
        env: { ...process.env, LC_ALL: 'pt_BR.UTF-8', CI: ci },
        encoding: 'utf8'
      }
    )
    assert.equal(result.status, 0, result.stderr)
    assert.equal(readLocaleSettings(dir).baseLocale, 'pt')
  }
})

void it('keeps the template base for a questionnaire language outside its catalogs', () => {
  assert.equal(
    questionnaireBase({ language: 'fr', defaults }),
    defaults.baseLocale
  )
})

void it('uses the template settings on a host and the base language on a client', () => {
  for (const mode of ['server', 'static'] as const) {
    assert.deepEqual(resolve({ mode }), defaults)
  }
  assert.deepEqual(resolve({ mode: 'client' }), {
    baseLocale: 'en',
    locales: ['en']
  })
  assert.deepEqual(resolve({ mode: 'client', baseLocale: 'zh-hant-tw' }), {
    baseLocale: 'zh-Hant-TW',
    locales: ['zh-Hant-TW']
  })
})

void it('canonicalizes tags without moving an explicit base or guessing a region', () => {
  const locales = ['fr', 'JA']
  assert.deepEqual(resolve({ locales }), {
    locales: ['fr', 'ja'],
    baseLocale: 'fr'
  })
  assert.deepEqual(resolve({ locales, baseLocale: 'ja' }), {
    locales: ['fr', 'ja'],
    baseLocale: 'ja'
  })
  assert.deepEqual(resolve({ hasI18n: false, baseLocale: 'es-mx' }), {
    locales: ['es-MX'],
    baseLocale: 'es-MX'
  })
})

void it('rejects contradictory or malformed locale options with the flag name', () => {
  for (const locales of [
    [],
    [''],
    ['en', ' '],
    ['en', 'EN'],
    ['en_US'],
    ['iw', 'he']
  ]) {
    assert.throws(() => resolve({ locales }), /--locales/u)
  }
  assert.throws(
    () => resolve({ locales: ['fr'], baseLocale: 'ja' }),
    /--base-locale/u
  )
  assert.throws(() => resolve({ baseLocale: '_' }), /--base-locale/u)
  assert.throws(
    () => resolve({ hasI18n: false, locales: ['en'] }),
    /--locales/u
  )
  assert.throws(
    () => resolve({ mode: 'client', locales: ['fr', 'ja'] }),
    /--mode static/u
  )
})

void it('rejects invalid locale flags before creating the destination', context => {
  const root = mkdtempSync(path.join(tmpdir(), 'solid-locale-flags-'))
  context.after(() => rmSync(root, { recursive: true, force: true }))
  const dir = path.join(root, 'app')
  for (const [args, message] of [
    [['--no-i18n', '--locales', 'en'], '--locales'],
    [['--locales', ''], '--locales'],
    [['--locales', 'es,ES'], '--locales'],
    [['--locales', 'bad_tag'], '--locales'],
    [['--locales', 'fr', '--base-locale', 'ja'], '--base-locale'],
    [['--mode', 'client', '--locales', 'en,ja'], '--mode static']
  ] as const) {
    const result = spawnSync(
      process.execPath,
      ['src/create-solid.ts', dir, ...args, '--no-git', '--no-install'],
      { encoding: 'utf8' }
    )
    assert.equal(result.status, usageExitCode)
    assert.ok(result.stderr.includes(message))
    assert.ok(!existsSync(dir))
  }
})

void it('generates only the requested catalogs and identifies every seed', context => {
  const root = mkdtempSync(path.join(tmpdir(), 'solid-locale-catalogs-'))
  context.after(() => rmSync(root, { recursive: true, force: true }))
  const dir = path.join(root, 'app')
  const result = spawnSync(
    process.execPath,
    [
      'src/create-solid.ts',
      dir,
      '--mode',
      'static',
      '--locales',
      'pt-br,fr,ja,en-x-custom,pt,es',
      '--base-locale',
      'ja',
      '--title',
      'Loja {x}',
      '--no-install'
    ],
    { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } }
  )
  assert.equal(result.status, 0, result.stderr)
  assert.doesNotMatch(result.stdout, /Initialized empty Git repository/u)
  const gitOutput = result.stdout.indexOf('Git repository created')
  assert.ok(gitOutput !== -1, result.stdout)
  const locales = ['pt-BR', 'fr', 'ja', 'en-x-custom', 'pt', 'es']
  assert.deepEqual(readLocaleSettings(dir), { locales, baseLocale: 'ja' })
  for (const locale of locales.filter(tag => !['pt', 'es'].includes(tag))) {
    assert.ok(
      readFileSync(path.join(dir, 'README.md'), 'utf8')
        .split('\n')
        .includes(`- Translate the seeded catalog for \`${locale}\`.`)
    )
    const notice = result.stdout.indexOf(
      `Translate the seeded messages for ${locale}.`
    )
    assert.ok(notice !== -1 && notice < gitOutput, result.stdout)
  }
  const namesFile = path.join(
    dir,
    'src/components/molecules/LocaleSwitcher/names.json'
  )
  const names: unknown = JSON.parse(readFileSync(namesFile, 'utf8'))
  assert.deepEqual(names, {
    'pt-BR': 'Português (Brasil)',
    fr: 'Français',
    ja: '日本語',
    'en-x-custom': 'en-x-custom',
    pt: 'Português',
    es: 'Español'
  })
  const overrides = readFileSync(
    path.join(dir, 'src/i18n/localeTagOverrides/index.ts'),
    'utf8'
  )
  assert.match(overrides, /pt: 'pt-BR'/u)
  assert.match(overrides, /es: 'es-ES'/u)
  assert.doesNotMatch(overrides, /en: 'en-US'/u)
  const folders = catalogFolders(dir)
  assert.ok(folders.length > 0)
  for (const folder of folders) {
    assert.deepEqual(
      readdirSync(folder)
        .filter(file => file.endsWith('.json'))
        .toSorted(),
      locales.map(tag => `${tag}.json`).toSorted()
    )
  }
  const file = path.join(dir, 'src/routes/(base)/about/i18n')
  const message = (tag: string) =>
    readFileSync(path.join(file, `${tag}.json`), 'utf8')
  assert.match(message('pt-BR'), /Sobre Loja/u)
  assert.match(message('ja'), /About Loja/u)
  assert.equal(message('ja'), message('fr'))
})

void it('omits the language switcher and its unused menu in a one-language client', context => {
  const root = mkdtempSync(path.join(tmpdir(), 'solid-single-language-'))
  context.after(() => rmSync(root, { recursive: true, force: true }))
  const dir = path.join(root, 'app')
  const result = spawnSync(
    process.execPath,
    [
      'src/create-solid.ts',
      dir,
      '--mode',
      'client',
      '--base-locale',
      'zh-Hant-TW',
      '--no-theme',
      '--no-install',
      '--no-git'
    ],
    { encoding: 'utf8' }
  )
  assert.equal(result.status, 0, result.stderr)
  assert.ok(
    !existsSync(path.join(dir, 'src/components/molecules/LocaleSwitcher'))
  )
  assert.ok(!existsSync(path.join(dir, 'src/components/atoms/DropdownMenu')))
  assert.match(
    readFileSync(path.join(dir, 'index.html'), 'utf8'),
    /<html lang="zh-Hant-TW">/u
  )
})

void it('emits local messages, plain links and the base language without a catalog compiler', context => {
  const root = mkdtempSync(path.join(tmpdir(), 'solid-plain-application-'))
  context.after(() => rmSync(root, { recursive: true, force: true }))
  for (const mode of ['client', 'static', 'server']) {
    const dir = path.join(root, mode)
    const result = spawnSync(
      process.execPath,
      [
        'src/create-solid.ts',
        dir,
        '--no-install',
        '--no-git',
        '--no-i18n',
        '--base-locale',
        'es-MX',
        '--mode',
        mode
      ],
      { encoding: 'utf8' }
    )
    assert.equal(result.status, 0, result.stderr)
    assert.ok(!existsSync(path.join(dir, 'project.inlang')))
    assert.deepEqual(catalogFolders(dir), [])
    const read = (name: string) => readFileSync(path.join(dir, name), 'utf8')
    if (mode === 'server') {
      assert.ok(
        read('src/infra/server/configureServerErrors/index.ts').includes(
          'm.configureServerErrors_message({}, { locale })'
        )
      )
    }
    assert.match(read('vite.config.ts'), /language: 'es-MX'/u)
    assert.doesNotMatch(
      read('package.json'),
      /@inlang|paraglide|i18n:generate/iu
    )
    assert.doesNotMatch(read('src/App.tsx'), /createLocaleNavigationGuard/u)
    assert.match(read('src/constants/messages/index.ts'), /Acerca de/u)
    assert.match(
      read('src/components/organisms/Topbar/index.tsx'),
      /<a href="\/"/u
    )
    if (mode === 'client') assert.match(read('index.html'), /lang="es-MX"/u)
  }
})

void it('keeps the template switcher and language examples for the default server', context => {
  const root = mkdtempSync(path.join(tmpdir(), 'solid-template-locales-'))
  context.after(() => rmSync(root, { recursive: true, force: true }))
  const dir = path.join(root, 'app')
  const result = spawnSync(
    process.execPath,
    ['src/create-solid.ts', dir, '--no-install', '--no-git'],
    { encoding: 'utf8' }
  )
  assert.equal(result.status, 0, result.stderr)
  const read = (file: string) => readFileSync(path.join(dir, file), 'utf8')
  const switcher = 'src/components/molecules/LocaleSwitcher/constants.ts'
  assert.equal(
    read(switcher),
    readFileSync(path.join('template', switcher), 'utf8')
  )
  assert.match(read('docs/testing.md'), /inspected in the three locales/u)
  assert.match(
    read('docs/seo/publication.md'),
    /300,000 URLs in the three locales/u
  )
  assert.match(read('docs/seo/sitemap.md'), /`\/pt\/blog\/x`/u)
})
