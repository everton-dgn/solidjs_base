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
async function generatedBlock(t: TestContext): Promise<string> {
  const { root, file } = await fixture(t)
  await agents({ root, shouldWrite: true })
  const contents = await readFile(file, 'utf8')
  return contents.slice(0, -1)
}
const START = '<!--SOLID BASE START-->'
const END = '<!--SOLID BASE END-->'
const VITE_START = '<!--VITE PLUS START-->'
const VITE_END = '<!--VITE PLUS END-->'

for (const lines of [
  ['``` invalid`', '```', START, END, '```'],
  ['- example', '  ```', '', '```', START, END, '```'],
  ['- - -', '  ```', START, 'example', END, '```'],
  ['    ```', '  ```', START, END, '```'],
  ['Use ``` to open a fence.', START, END],
  ['~~~md', START, END, '~~~'],
  [VITE_START, '~~~', VITE_END, START, 'original', END, '~~~'],
  ['<pre>', START, 'original', END, '</pre>'],
  ['- <script>', START, 'original', END],
  ['<!--', START, 'original', END],
  ['<?process', START, 'original', END, '?>'],
  ['<!DOCTYPE html', START, 'original', END],
  ['<![CDATA[', START, 'original', END, ']]>'],
  [START, '```', END, '```'],
  [START],
  [END],
  [END, START],
  [START, END, START, END],
  [`prefix ${START}`],
  ['<!-- SOLID BASE START -->']
]) {
  const contents = lines.join('\n')
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
for (const lines of [
  [VITE_START, '~~~', VITE_END, 'original', '~~~'],
  ['~~~', 'example', '~~~', VITE_END],
  ['<pre>', VITE_START, VITE_END, 'original', '</pre>'],
  ['# Notes', '```sh', 'vp run dev', '```', VITE_START, VITE_END, '']
]) {
  const existing = lines.join('\n')
  test(`inserts at the top of ${JSON.stringify(existing)}`, async t => {
    const block = await generatedBlock(t)
    const { root, file } = await fixture(t)
    await writeFile(file, existing)
    assert.equal(await agents({ root, shouldWrite: true }), 'missing')
    assert.equal(await readFile(file, 'utf8'), `${block}\n${existing}`)
    assert.equal(await agents({ root, shouldWrite: true }), 'current')
  })
}
test('keeps a byte order mark first', async t => {
  const block = await generatedBlock(t)
  const { root, file } = await fixture(t)
  await writeFile(file, '﻿# App')
  await agents({ root, shouldWrite: true })
  assert.equal(await readFile(file, 'utf8'), `﻿${block}\n# App`)
})
test('replaces the block in place, preserving CRLF and surrounding text', async t => {
  const block = await generatedBlock(t)
  const { root, file } = await fixture(t)
  const prefix = `${VITE_START}\r\n${VITE_END}\r\n`
  await writeFile(file, prefix + [START, 'old', END, 'custom'].join('\r\n'))
  assert.equal(await agents({ root, shouldWrite: false }), 'outdated')
  await agents({ root, shouldWrite: true })
  const current = await readFile(file, 'utf8')
  assert.equal(current, `${prefix + block.replaceAll('\n', '\r\n')}\r\ncustom`)
  assert.equal(await agents({ root, shouldWrite: true }), 'current')
  assert.equal(await readFile(file, 'utf8'), current)
})
test('accepts raw HTML that closes on its own line above the block', async t => {
  const { root, file } = await fixture(t)
  const above = ['<!-- note -->', '<pre>x</pre>', '<!DOCTYPE html>', '']
  await writeFile(file, above.join('\n') + [START, 'old', END].join('\n'))
  assert.equal(await agents({ root, shouldWrite: true }), 'outdated')
  const current = await readFile(file, 'utf8')
  assert.ok(current.startsWith(above.join('\n') + START))
})
test('names the line that blocks a marker', async t => {
  const { root, file } = await fixture(t)
  await writeFile(file, ['# App', '~~~sh', '~~~', START, END].join('\n'))
  await assert.rejects(
    agents({ root, shouldWrite: true }),
    /AGENTS\.md:4: SOLID BASE marker below line 2/u
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

void test('recognizes the standalone direct doctor command without accepting other edits', async t => {
  const { root, file } = await fixture(t)
  await agents({ root, shouldWrite: true })
  const original = await readFile(file, 'utf8')
  const standalone = original
    .replace(
      'Before changing code, run `vp run doctor`.',
      'Before changing code, run the doctor command below.'
    )
    .replace('If the Vite config fails to load, run ', 'Run ')
  await writeFile(file, standalone)
  assert.equal(await agents({ root, shouldWrite: true }), 'current')
  assert.equal(await readFile(file, 'utf8'), standalone)
  await writeFile(
    file,
    standalone.replace('doctor --root .', 'doctor --root /')
  )
  assert.equal(await agents({ root, shouldWrite: false }), 'outdated')
})
