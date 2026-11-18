import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, type TestContext } from 'node:test'

import { agents } from '../index.ts'

async function fixture(t: TestContext) {
  const root = await mkdtemp(path.join(tmpdir(), 'solid-instructions-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return { root, file: path.join(root, 'AGENTS.md') }
}
const START = '<!--SOLID BASE START-->'
const END = '<!--SOLID BASE END-->'
const VITE = '<!--VITE PLUS START-->\n<!--VITE PLUS END-->'

for (const contents of [
  START,
  END,
  `${END}\n${START}`,
  [START, END, START, END].join('\n'),
  [`~~~md`, START, END, '~~~'].join('\n'),
  `${VITE}\n${VITE}`,
  '<!--VITE PLUS END-->',
  '<!-- VITE PLUS START -->',
  `prefix ${START}`
]) {
  test(`rejects ambiguous markers in ${JSON.stringify(contents)}`, async t => {
    const { root, file } = await fixture(t)
    await writeFile(file, contents)
    await assert.rejects(agents({ root, write: true }), /AGENTS\.md:\d+/u)
    assert.equal(await readFile(file, 'utf8'), contents)
  })
}
test('creates the instructions when only CLAUDE.md exists', async t => {
  const { root, file } = await fixture(t)
  const claude = path.join(root, 'CLAUDE.md')
  await writeFile(claude, '@AGENTS.md')
  assert.equal(await agents({ root, write: false }), 'missing')
  await agents({ root, write: true })
  const generated = await readFile(file, 'utf8')
  assert.ok(generated.startsWith(START))
  assert.equal(await readFile(claude, 'utf8'), '@AGENTS.md')
})
test('updates after Vite+, preserving CRLF and surrounding text', async t => {
  const { root, file } = await fixture(t)
  const prefix = `${VITE.replaceAll('\n', '\r\n')}\r\n`
  await writeFile(file, `${prefix}custom`)
  await agents({ root, write: true })
  const current = await readFile(file, 'utf8')
  assert.ok(current.startsWith(`${prefix + START}\r\n`))
  assert.ok(current.endsWith(`${END}\r\ncustom`))
  await writeFile(file, prefix + [START, 'old', END, 'custom'].join('\r\n'))
  assert.equal(await agents({ root, write: false }), 'outdated')
  await agents({ root, write: true })
  assert.equal(await agents({ root, write: true }), 'current')
  assert.equal(await readFile(file, 'utf8'), current)
})
