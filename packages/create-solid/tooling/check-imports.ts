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

export function checkImports(dir: string, files: readonly string[]): void {
  const paths = new Set(files)
  for (const file of files) {
    if (!/\.[cm]?[jt]sx?$/u.test(file)) continue
    const text = readFileSync(path.join(dir, file), 'utf8')
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
      if (!candidates.some(candidate => paths.has(candidate))) {
        throw new Error(`Unknown template import in ${file}: ${source}`)
      }
    }
  }
}
