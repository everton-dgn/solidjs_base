import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, type TestContext } from 'node:test'

import { LOCALES } from '../../testProject/index.ts'
import { isCatalogFile, readCatalogs } from '../index.ts'

type FixtureOptions = {
  parent: string
  messages?: Record<string, unknown>
  locales?: string[]
}
type WriteOptions = {
  root: string
  locale: string
  value: unknown
  consumer?: string
}

async function sandbox(context: TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'i18n-catalogs-'))
  context.after(async () => {
    await rm(directory, { recursive: true, force: true })
  })
  return directory
}

async function writeCatalog({
  root,
  locale,
  value,
  consumer = 'Home'
}: WriteOptions): Promise<void> {
  const directory = path.join(root, 'src/routes', consumer, 'i18n')
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, `${locale}.json`), JSON.stringify(value))
}

async function fixture({
  parent,
  messages = { home_hello: 'Hello {name}' },
  locales = LOCALES
}: FixtureOptions) {
  const root = await mkdtemp(path.join(parent, 'case-'))
  await symlink(
    path.resolve(import.meta.dirname, '../../../../node_modules'),
    path.join(root, 'node_modules')
  )
  for (const locale of locales) {
    await writeCatalog({ root, locale, value: messages })
  }
  return { root, locales: LOCALES, baseLocale: 'de' }
}

describe('colocated translations', () => {
  it('collects colocated and shared catalogs in all three locales', async context => {
    const parent = await sandbox(context)
    const options = await fixture({ parent })
    const shared = path.join(options.root, 'src/i18n')
    await mkdir(shared, { recursive: true })
    for (const locale of LOCALES) {
      await writeFile(
        path.join(shared, `${locale}.json`),
        JSON.stringify({ site_title: 'Site' })
      )
    }
    const catalogs = await readCatalogs(options)
    assert.deepEqual(Object.keys(catalogs), LOCALES)
    for (const locale of LOCALES) {
      assert.equal(catalogs[locale]?.home_hello, 'Hello {name}')
      assert.equal(catalogs[locale].site_title, 'Site')
    }
  })

  it('fails when a locale file is absent, even when it is the reference', async context => {
    const parent = await sandbox(context)
    for (const missing of LOCALES) {
      const available = LOCALES.filter(locale => locale !== missing)
      await assert.rejects(
        readCatalogs(await fixture({ parent, locales: available })),
        new RegExp(`missing locales \\[${missing}\\]`, 'u')
      )
    }
  })

  it('fails on missing, extra and mismatched parameters', async context => {
    const parent = await sandbox(context)
    for (const { value, error } of [
      {
        value: { home_other: 'Hello' },
        error: /it\.json: missing-translation.*home_hello/u
      },
      {
        value: { home_hello: 'Hello {name}', home_extra: 'Extra' },
        error: /de\.json: missing-translation.*home_extra/u
      },
      {
        value: { home_hello: 'Hello' },
        error: /it\.json: missing-variable.*name/u
      },
      {
        value: { home_hello: 'Hello {username}' },
        error: /it\.json: unknown-variable.*username/u
      }
    ]) {
      const options = await fixture({ parent })
      await writeCatalog({ root: options.root, locale: 'it', value })
      await assert.rejects(readCatalogs(options), error)
    }
  })

  it('rejects blank messages, malformed JSON and repeated JSON properties', async context => {
    const parent = await sandbox(context)
    for (const { source, error } of [
      { source: '{"home_hello":"   "}', error: /it\.json: empty-translation/u },
      { source: '{bad}', error: /Invalid catalog.*it\.json/u },
      {
        source: '{"home_hello":"a","home_hello":"b"}',
        error: /duplicate key "home_hello"/u
      },
      { source: '{}', error: /Empty catalog/u }
    ]) {
      const options = await fixture({ parent })
      await writeFile(
        path.join(options.root, 'src/routes/Home/i18n/it.json'),
        source
      )
      await assert.rejects(readCatalogs(options), error)
    }
  })

  it('rejects duplicate IDs across consumers and unexpected locale files', async context => {
    const parent = await sandbox(context)
    const duplicate = await fixture({ parent })
    for (const locale of LOCALES) {
      await writeCatalog({
        root: duplicate.root,
        locale,
        consumer: 'Other',
        value: { home_hello: 'Hello {name}' }
      })
    }
    await assert.rejects(
      readCatalogs(duplicate),
      /Duplicate message "home_hello"/u
    )
    const unexpected = await fixture({
      parent,
      locales: [...LOCALES, 'ja']
    })
    await assert.rejects(readCatalogs(unexpected), /unexpected \[ja\]/u)
  })

  it('supports plural variants and checks their input declarations', async context => {
    const parent = await sandbox(context)
    const plural = [
      {
        declarations: ['input count', 'local countPlural = count: plural'],
        selectors: ['countPlural'],
        match: {
          'countPlural=one': '{count} item',
          'countPlural=*': '{count} items'
        }
      }
    ]
    const options = await fixture({ parent, messages: { home_count: plural } })
    const catalogs = await readCatalogs(options)
    assert.deepEqual(catalogs.it?.home_count, plural)
    await writeCatalog({
      root: options.root,
      locale: 'it',
      value: { home_count: 'Items' }
    })
    await assert.rejects(
      readCatalogs(options),
      /it\.json: missing-variable.*home_count/u
    )
  })

  it('checks variables in every plural form with the native SDK', async context => {
    const parent = await sandbox(context)
    const plural = {
      declarations: [
        'input count',
        'input name',
        'local countPlural = count: plural'
      ],
      selectors: ['countPlural'],
      match: {
        'countPlural=one': '{name}: {count} item',
        'countPlural=*': '{name}: {count} items'
      }
    }
    const options = await fixture({
      parent,
      messages: { home_count: [plural] }
    })
    await writeCatalog({
      root: options.root,
      locale: 'it',
      value: {
        home_count: [
          {
            ...plural,
            match: { ...plural.match, 'countPlural=*': '{count} items' }
          }
        ]
      }
    })
    await assert.rejects(
      readCatalogs(options),
      /it\.json: missing-variable.*name/u
    )
  })

  it('fails at the catalog that crosses the byte budget, before parsing it', async context => {
    const parent = await sandbox(context)
    const options = await fixture({ parent })
    const valid = Buffer.byteLength(
      JSON.stringify({ home_hello: 'Hello {name}' })
    )
    const broken = '{'
    await writeFile(
      path.join(options.root, 'src/routes/Home/i18n/it.json'),
      broken
    )
    const total = valid * (LOCALES.length - 1) + broken.length
    await assert.rejects(
      readCatalogs({ ...options, maxBytes: total - 1 }),
      /exceed the \d+ byte budget at src\/routes\/Home\/i18n\/it\.json/u
    )
    await assert.rejects(
      readCatalogs({ ...options, maxBytes: total }),
      /Invalid catalog src\/routes\/Home\/i18n\/it\.json/u
    )
  })

  it('checks the size before reading the catalog that crosses the budget', async context => {
    const parent = await sandbox(context)
    const options = await fixture({ parent })
    const valid = Buffer.byteLength(
      JSON.stringify({ home_hello: 'Hello {name}' })
    )
    // A directory passes stat but cannot be read as a file; the budget error
    // proves that the limit is checked before opening it.
    const unreadable = path.join(options.root, 'src/routes/Home/i18n/it.json')
    await rm(unreadable)
    await mkdir(path.join(unreadable, 'entry'), { recursive: true })
    await assert.rejects(
      readCatalogs({ ...options, maxBytes: valid * (LOCALES.length - 1) }),
      /exceed the \d+ byte budget at src\/routes\/Home\/i18n\/it\.json/u
    )
  })
})

describe('catalog file filter', () => {
  it('matches only the colocated catalogs that the generator reads', () => {
    const root = path.join(tmpdir(), 'project')
    const accepted = [
      'src/routes/(base)/(home)/i18n/de.json',
      'src/components/atoms/Button/i18n/fr.json',
      'src/i18n/it.json'
    ]
    const ignored = [
      '.paraglide/messages/de.json',
      'paraglide/messages/home_title.js',
      'paraglide/messages/de.json',
      'paraglide/i18n/de.json',
      'src/routes/Home/messages/de.json',
      'src/i18n/messages/de.json',
      'src/tests/fixtures/i18n/de.json',
      'src/components/Button/__tests__/i18n/de.json',
      'src/routes/Home/i18n/nested/de.json',
      'src/routes/Home/i18n/de.js',
      '../outside/src/routes/Home/i18n/de.json'
    ]
    for (const file of accepted) {
      assert.equal(isCatalogFile({ root, file: path.join(root, file) }), true)
    }
    for (const file of ignored) {
      assert.equal(isCatalogFile({ root, file: path.join(root, file) }), false)
    }
  })
})
