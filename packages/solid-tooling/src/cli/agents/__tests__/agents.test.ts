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
  ['``` invalid`', '```', START, END, '```'].join('\n'),
  ['- example', '  ```', '', '```', START, END, '```'].join('\n'),
  ['- - -', '  ```', START, 'example', END, '```'].join('\n'),
  ['    ```', '  ```', START, END, '```'].join('\n'),
  ['Use ``` to open a fence.', START, END].join('\n'),
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
    await assert.rejects(agents({ root, shouldWrite: true }), /AGENTS\.md:\d+/u)
    assert.equal(await readFile(file, 'utf8'), contents)
  })
}
test('creates the instructions when only CLAUDE.md exists', async t => {
  const { root, file } = await fixture(t)
  const claude = path.join(root, 'CLAUDE.md')
  await writeFile(claude, '@AGENTS.md')
  assert.equal(await agents({ root, shouldWrite: false }), 'missing')
  await agents({ root, shouldWrite: true })
  const generated = await readFile(file, 'utf8')
  assert.ok(generated.startsWith(START))
  assert.equal(await readFile(claude, 'utf8'), '@AGENTS.md')
})
test('updates after Vite+, preserving CRLF and surrounding text', async t => {
  const { root, file } = await fixture(t)
  const prefix = `${VITE.replaceAll('\n', '\r\n')}\r\n`
  await writeFile(file, `${prefix}custom`)
  await agents({ root, shouldWrite: true })
  const current = await readFile(file, 'utf8')
  assert.ok(current.startsWith(`${prefix + START}\r\n`))
  assert.ok(current.endsWith(`${END}\r\ncustom`))
  await writeFile(file, prefix + [START, 'old', END, 'custom'].join('\r\n'))
  assert.equal(await agents({ root, shouldWrite: false }), 'outdated')
  await agents({ root, shouldWrite: true })
  assert.equal(await agents({ root, shouldWrite: true }), 'current')
  assert.equal(await readFile(file, 'utf8'), current)
})
test('names the code fence that blocks a marker', async t => {
  const { root, file } = await fixture(t)
  await writeFile(file, ['# App', '~~~sh', '~~~', START, END].join('\n'))
  await assert.rejects(
    agents({ root, shouldWrite: true }),
    /AGENTS\.md:4: SOLID BASE marker below the code fence of line 2/u
  )
})
test('updates the block and keeps the code fences below it', async t => {
  const { root, file } = await fixture(t)
  const below = ['', '```sh', 'vp run doctor', '```'].join('\n')
  await writeFile(file, [START, 'old', END].join('\n') + below)
  assert.equal(await agents({ root, shouldWrite: true }), 'outdated')
  const current = await readFile(file, 'utf8')
  assert.ok(current.endsWith(`${END}${below}`))
  assert.equal(await agents({ root, shouldWrite: true }), 'current')
})
test('goes to the top when Vite+ appended its block below code', async t => {
  const { root, file } = await fixture(t)
  const existing = ['# Notes', '```sh', 'vp run dev', '```', VITE, ''].join(
    '\n'
  )
  await writeFile(file, existing)
  assert.equal(await agents({ root, shouldWrite: true }), 'missing')
  const current = await readFile(file, 'utf8')
  assert.ok(current.startsWith(START))
  assert.ok(current.endsWith(`${END}\n${existing}`))
  assert.equal(await agents({ root, shouldWrite: true }), 'current')
})
test('follows a Vite+ block that holds a code example', async t => {
  const { root, file } = await fixture(t)
  const vite = VITE.replace('\n', '\n```sh\nvp check\n```\n')
  await writeFile(file, `${vite}\ncustom`)
  await agents({ root, shouldWrite: true })
  assert.ok((await readFile(file, 'utf8')).startsWith(`${vite}\n${START}`))
})
