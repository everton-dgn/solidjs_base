import assert from 'node:assert/strict'
import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { argv } from 'node:process'

type LinkAttributes = { href: string }
type ImageAttributes = { src: string }
type RenderCallbacks = {
  link: (text: string, attributes: LinkAttributes) => string
  image: (text: string, attributes: ImageAttributes) => string
}
type BunYaml = { parse: (source: string) => unknown }
type BunMarkdown = {
  render: (source: string, callbacks: RenderCallbacks) => string
}
type BunRuntime = { YAML: BunYaml; markdown: BunMarkdown }

// The tarball harness runs this test with the workspace's pinned Bun.
declare const Bun: BunRuntime

const CLI_ARGUMENT_OFFSET = 2
const [folder, name] = argv.slice(CLI_ARGUMENT_OFFSET)
assert.ok(folder && name)
const root = await realpath(folder)
const skill = path.join(root, 'skills', name, 'SKILL.md')
const pending = [skill]
const visited = new Set()
for (const file of pending) {
  const resolved = await realpath(file)
  assert.ok(resolved.startsWith(root + path.sep), resolved)
  if (visited.has(resolved)) continue
  visited.add(resolved)
  if (!resolved.endsWith('.md')) continue
  const contents = await readFile(resolved, 'utf8')
  if (file === skill) {
    const header = /^---\r?\n(?<yaml>[\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(
      contents
    )
    assert.ok(header?.groups?.yaml, file)
    const fields = Bun.YAML.parse(header.groups.yaml)
    assert.ok(
      fields !== null &&
        typeof fields === 'object' &&
        'name' in fields &&
        'description' in fields
    )
    assert.equal(fields.name, name)
    assert.ok(typeof fields.description === 'string')
    assert.ok(fields.description.trim())
  }
  const links: string[] = []
  Bun.markdown.render(contents, {
    link(text, { href }) {
      links.push(href)
      return text
    },
    image(text, { src }) {
      links.push(src)
      return text
    }
  })
  for (const href of links) {
    const [target] = href.split(/[?#]/u)
    if (!target || /^[a-z][a-z0-9+.-]*:/iu.test(target)) continue
    pending.push(
      path.resolve(path.dirname(resolved), decodeURIComponent(target))
    )
  }
}
