import { parseSync, Visitor } from 'oxc-parser'

export function references(file: string, text: string): Set<string> {
  const parsed = parseSync(file, text)
  if (parsed.errors.length > 0) {
    throw new Error(`Invalid template module: ${file}`)
  }
  const sources = new Set<string>()
  new Visitor({
    CallExpression(node) {
      const [source] = node.arguments
      if (
        node.callee.type === 'Identifier' &&
        node.callee.name === 'require' &&
        source?.type === 'Literal' &&
        typeof source.value === 'string'
      ) {
        sources.add(source.value)
      }
    },
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
