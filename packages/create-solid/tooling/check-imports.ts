import { readFileSync } from 'node:fs'
import path from 'node:path'

import { parseSync, Visitor } from 'oxc-parser'

function references(file: string, text: string): Set<string> {
  const parsed = parseSync(file, text)
  if (parsed.errors.length > 0) {
    throw new Error(`Invalid template module: ${file}`)
  }
  const sources = new Set<string>()
  new Visitor({
    ImportDeclaration(node) {
      sources.add(node.source.value)
    },
    ExportAllDeclaration(node) {
      sources.add(node.source.value)
    },
    ExportNamedDeclaration(node) {
      if (node.source) sources.add(node.source.value)
    },
    TSImportType(node) {
      sources.add(node.source.value)
    },
    ImportExpression(node) {
      const { source } = node
      if (source.type === 'Literal' && typeof source.value === 'string') {
        sources.add(source.value)
      }
    }
  }).visit(parsed.program)
  return sources
}

const taskEntries = new Set([
  'env.ts',
  'src/entry-client.tsx',
  'src/entry-server.tsx',
  'src/tests/fixtures/e2e/middleware/index.ts',
  'src/tests/fixtures/routes/users/[id].tsx',
  'tooling/css/check.ts',
  'tooling/knip.ts',
  'tooling/testing/error-backend.ts',
  'tooling/testing/serve-public.ts'
])

function isEntry(file: string): boolean {
  return (
    taskEntries.has(file) ||
    /(?:\.test(?:-d)?|\.d|\.config)\.[cm]?[jt]sx?$/u.test(file) ||
    (/^src\/(?:routes|tests\/fixtures\/e2e\/routes)\//u.test(file) &&
      /(?:\/index\.[jt]sx?|\.tsx)$/u.test(file)) ||
    /^src\/tests\/fixtures\/e2e\/routes\/(?:robots\.txt|llms\.txt|sitemap\.xml|publication-(?:source|stream)|sitemaps\/.*)\.ts$/u.test(
      file
    )
  )
}

export function checkImports(dir: string, files: readonly string[]): void {
  const paths = new Set(files)
  const graph = new Map<string, string[]>()
  for (const file of files) {
    if (!/\.[cm]?[jt]sx?$/u.test(file)) continue
    const text = readFileSync(path.join(dir, file), 'utf8')
    const dependencies: string[] = []
    graph.set(file, dependencies)
    for (const source of references(file, text)) {
      if (!source.startsWith('.') && !source.startsWith('@/')) continue
      const resolved = source.startsWith('@/')
        ? path.join('src', source.slice('@/'.length))
        : path.join(path.dirname(file), source)
      const candidates = [
        resolved,
        ...['.ts', '.tsx', '.js', '/index.ts', '/index.tsx'].map(
          suffix => resolved + suffix
        )
      ]
      const target = candidates.find(candidate => paths.has(candidate))
      if (!target) {
        throw new Error(`Unknown template import in ${file}: ${source}`)
      }
      dependencies.push(target)
    }
  }
  const visited = new Set<string>()
  function visit(file: string): void {
    if (visited.has(file)) return
    visited.add(file)
    for (const target of graph.get(file) ?? []) visit(target)
  }
  for (const file of graph.keys()) {
    if (isEntry(file)) visit(file)
  }
  for (const file of graph.keys()) {
    if (!visited.has(file)) {
      throw new Error(`Unreachable template module: ${file}`)
    }
  }
}
