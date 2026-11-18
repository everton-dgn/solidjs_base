import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { Window } from 'happy-dom'

type StaticDirectories = { dir: string; publicDir: string }
type ManifestInput = { output: StaticDirectories; sitemaps: string[] }

type HtmlInspection = { hasNonce: boolean; hashes: string[] }
const UNION_HASH_BUDGET = 1800
const JSON_INDENT = 2
const EXECUTABLE_SCRIPT =
  /^(?:module|importmap|speculationrules|(?:application|text)\/(?:x-)?(?:java|ecma)script|text\/(?:javascript1\.[0-5]|livescript|jscript))$/u

export function inspectHtml(html: string): HtmlInspection {
  const window = new Window()
  try {
    const document = new window.DOMParser().parseFromString(html, 'text/html')
    const hashes = new Set<string>()
    const roots: (
      | typeof document
      | ReturnType<typeof document.createDocumentFragment>
    )[] = [document]
    let hasNonce = false
    for (const root of roots) {
      hasNonce ||= root.querySelector('[nonce]') !== null
      for (const template of root.querySelectorAll('template')) {
        roots.push(template.content)
      }
      for (const script of root.querySelectorAll('script:not([src])')) {
        const type = script.getAttribute('type')?.trim().toLowerCase()
        if (type && !EXECUTABLE_SCRIPT.test(type)) continue
        const text = script.textContent.replaceAll(/\r\n?/gu, '\n')
        hashes.add(
          `sha256-${createHash('sha256').update(text).digest('base64')}`
        )
      }
    }
    return {
      hasNonce,
      hashes: [...hashes].toSorted()
    }
  } finally {
    void window.happyDOM.close()
  }
}

export async function writeHashManifest({
  output,
  sitemaps
}: ManifestInput): Promise<void> {
  const pages: Record<string, string[]> = {}
  const files = await readdir(output.publicDir, {
    recursive: true,
    withFileTypes: true
  })
  const published = files
    .filter(file => file.isFile())
    .map(file => path.join(file.parentPath, file.name))
  const paths = new Set(
    published.map(file => `/${path.relative(output.publicDir, file)}`)
  )
  for (const sitemap of sitemaps) {
    if (!paths.has(sitemap)) {
      throw new Error(`output: static sitemap not published: ${sitemap}`)
    }
  }
  const htmlFiles = published.filter(file => file.endsWith('.html')).toSorted()
  for (const file of htmlFiles) {
    const html = await readFile(file, 'utf8')
    pages[`/${path.relative(output.publicDir, file)}`] =
      inspectHtml(html).hashes
  }
  const union = [...new Set(Object.values(pages).flat())].toSorted()
  if (union.map(hash => `'${hash}'`).join(' ').length > UNION_HASH_BUDGET) {
    console.warn(
      'output: static CSP union exceeds 1800 characters in hashes; use per-page policies'
    )
  }
  await writeFile(
    path.join(output.dir, 'csp-hashes.json'),
    `${JSON.stringify({ pages, union }, null, JSON_INDENT)}\n`
  )
}
