import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { it } from 'node:test'

import { messages } from '../src/cli-language.ts'
import { readLocaleSettings } from '../src/configureLocales/catalogs.ts'

void it('generates the static pnpm application from the documented questionnaire command', context => {
  const guide = readFileSync('docs/installation.md', 'utf8')
  const command =
    /```sh\nbunx @evertondgn\/create-solid@latest (?<arguments>[^`]+)\n```/u.exec(
      guide
    )?.groups?.arguments
  assert.ok(command)
  const args = command.replaceAll('\\\n', ' ').trim().split(/\s+/u)
  assert.equal(args[0], 'portal')
  assert.ok(args.includes('--no-install'))
  assert.ok(args.includes('--no-interactive'))
  const cwd = mkdtempSync(path.join(tmpdir(), 'solid-docs-'))
  context.after(() => rmSync(cwd, { recursive: true, force: true }))
  const output = execFileSync(
    process.execPath,
    [path.resolve('dist/create-solid.mjs'), ...args],
    { cwd, encoding: 'utf8' }
  )
  const dir = path.join(cwd, 'portal')
  const readme = readFileSync(path.join(dir, 'README.md'), 'utf8')
  for (const note of [
    'author, organization, social profiles and contact information',
    'Bun runs all application tasks'
  ]) {
    assert.ok(readme.replaceAll('\n', ' ').includes(note))
  }
  assert.doesNotMatch(readme, /vercel/iu)
  assert.deepEqual(readLocaleSettings(dir), {
    locales: ['en', 'es'],
    baseLocale: 'en'
  })
  assert.ok(existsSync(path.join(dir, '.git')))
  assert.ok(!existsSync(path.join(dir, 'node_modules')))
  assert.ok(output.includes('│ pnpm install '))
  assert.ok(output.includes('https://portal.example'))
  assert.match(
    readFileSync(path.join(dir, 'src/constants/site/title.ts'), 'utf8'),
    /Portal/u
  )
})

void it('keeps the guide transcript in the order of the English questionnaire', () => {
  const guide = readFileSync('docs/installation.md', 'utf8')
  const transcript = guide.split('```text\n')[1]?.split('```')[0]
  assert.ok(transcript)
  const m = messages.en
  let last = -1
  for (const label of [
    m.dir,
    m.title,
    m.mode,
    m.setup,
    m.features,
    m.url,
    m.i18n,
    m.locales,
    m.base,
    m.installer,
    m.git,
    m.install,
    m.summary,
    m.create,
    m.creating,
    m.gitTask,
    m.next,
    m.ready
  ]) {
    const index = transcript.indexOf(label, last + 1)
    assert.ok(index > last, label)
    last = index
  }
  for (const command of ['cd portal', 'pnpm install', 'pnpm run dev']) {
    assert.ok(transcript.includes(command))
  }
})

void it('keeps the README excerpt aligned with the questionnaire across releases', () => {
  const readme = readFileSync('README.md', 'utf8')
  const guide = readFileSync('docs/installation.md', 'utf8')
  for (const doc of [readme, guide]) {
    assert.doesNotMatch(doc, /Solid Base v\d+\.\d+\.\d+/u)
  }
  const excerpt = readme.split('```text\n')[1]?.split('```')[0]
  assert.ok(excerpt)
  let offset = 0
  for (const label of [
    messages.en.tagline,
    messages.en.dir,
    messages.en.title,
    messages.en.mode,
    messages.en.setup,
    messages.en.recommended
  ]) {
    const position = excerpt.indexOf(label, offset)
    assert.ok(position >= offset, label)
    offset = position + label.length
  }
  for (const entry of ['.git', '.DS_Store', 'Thumbs.db', 'git init']) {
    assert.ok(guide.includes(entry))
  }
})
