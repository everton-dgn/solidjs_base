import path from 'node:path'

import MagicString, { type SourceMap } from 'magic-string'
import { type ESTree, parse, Visitor } from 'vite-plus'

import { collectionOfImport, iconImport } from '../iconIds/index.ts'
import {
  importError,
  type ImportError,
  type UnsupportedForm,
  unsupportedImport
} from '../importErrors/index.ts'

// The name of the icon that an export name of a collection loads. It throws
// an ImportError when the collection has no such export.
type IconResolver = (request: ExportRequest) => Promise<string>
type RewriteInput = { code: string; id: string; resolveIcon: IconResolver }
type Statement = ESTree.Program['body'][number]
type StatementInput<Node> = {
  node: Node
  code: string
  resolveIcon: IconResolver
}
type Edit = { start: number; end: number; text: string }
type SourceInput = { code: string; node: ESTree.Span }
type FailInput = { form: UnsupportedForm; position: number }
type Lang = 'js' | 'jsx' | 'ts' | 'tsx'

const LANGS: Record<string, Lang> = {
  '.ts': 'ts',
  '.mts': 'ts',
  '.cts': 'ts',
  '.tsx': 'tsx',
  '.jsx': 'jsx'
}

function langOf(id: string): Lang {
  const [file = id] = id.split('?', 1)
  return LANGS[path.extname(file)] ?? 'js'
}

function nameOf(node: ESTree.ModuleExportName): string {
  return node.type === 'Literal' ? node.value : node.name
}

function sourceText({ code, node }: SourceInput): string {
  return code.slice(node.start, node.end)
}

// The first error in the order of the module, whichever settles first.
async function inOrder<Value>(tasks: Promise<Value>[]): Promise<Value[]> {
  const results = await Promise.allSettled(tasks)
  return results.map(result => {
    if (result.status === 'rejected') throw result.reason
    return result.value
  })
}

async function rewriteImport({
  node,
  code,
  resolveIcon
}: StatementInput<ESTree.ImportDeclaration>): Promise<Edit | undefined> {
  const collection = collectionOfImport(node.source.value)
  if (collection === undefined || node.importKind === 'type') return undefined
  const fail = ({ form, position }: FailInput) =>
    importError({ message: unsupportedImport({ collection, form }), position })
  if (node.specifiers.length === 0) {
    throw fail({ form: 'bare', position: node.start })
  }
  const named: ESTree.ImportSpecifier[] = []
  for (const specifier of node.specifiers) {
    if (specifier.type === 'ImportNamespaceSpecifier') {
      throw fail({ form: 'namespace', position: specifier.start })
    }
    if (specifier.type === 'ImportDefaultSpecifier') {
      throw fail({ form: 'default', position: specifier.start })
    }
    named.push(specifier)
  }
  // WHY: with verbatimModuleSyntax a type specifier left in an import of
  // values keeps the import of the collection itself; an import type is
  // always removed.
  const types = named
    .filter(specifier => specifier.importKind === 'type')
    .map(specifier => code.slice(specifier.imported.start, specifier.end))
  const values = await inOrder(
    named
      .filter(specifier => specifier.importKind !== 'type')
      .map(async specifier => {
        const name = await resolveIcon({
          collection,
          exportName: nameOf(specifier.imported),
          position: specifier.imported.start
        })
        return `import ${specifier.local.name} from ${JSON.stringify(iconImport({ collection, name }))};`
      })
  )
  const typeImport =
    types.length > 0
      ? [
          `import type { ${types.join(', ')} } from ${sourceText({ code, node: node.source })};`
        ]
      : []
  return {
    start: node.start,
    end: node.end,
    text: [...typeImport, ...values].join(' ')
  }
}

async function rewriteExport({
  node,
  code,
  resolveIcon
}: StatementInput<ESTree.ExportNamedDeclaration>): Promise<Edit | undefined> {
  if (!node.source || node.exportKind === 'type') return undefined
  const collection = collectionOfImport(node.source.value)
  if (collection === undefined) return undefined
  if (node.specifiers.length === 0) {
    throw importError({
      message: unsupportedImport({ collection, form: 'bare' }),
      position: node.start
    })
  }
  const source = sourceText({ code, node: node.source })
  const types = node.specifiers
    .filter(specifier => specifier.exportKind === 'type')
    .map(specifier => code.slice(specifier.local.start, specifier.end))
  const values = await inOrder(
    node.specifiers
      .filter(specifier => specifier.exportKind !== 'type')
      .map(async specifier => {
        const name = await resolveIcon({
          collection,
          exportName: nameOf(specifier.local),
          position: specifier.local.start
        })
        const exported = sourceText({ code, node: specifier.exported })
        return `export { default as ${exported} } from ${JSON.stringify(iconImport({ collection, name }))};`
      })
  )
  const typeExport =
    types.length > 0
      ? [`export type { ${types.join(', ')} } from ${source};`]
      : []
  return {
    start: node.start,
    end: node.end,
    text: [...typeExport, ...values].join(' ')
  }
}

function assertNoExportAll(node: ESTree.ExportAllDeclaration): void {
  const collection = collectionOfImport(node.source.value)
  if (collection === undefined || node.exportKind === 'type') return
  throw importError({
    message: unsupportedImport({ collection, form: 'export-all' }),
    position: node.start
  })
}

async function rewriteStatement({
  node,
  ...input
}: StatementInput<Statement>): Promise<Edit | undefined> {
  if (node.type === 'ImportDeclaration') {
    return rewriteImport({ node, ...input })
  }
  if (node.type === 'ExportNamedDeclaration') {
    return rewriteExport({ node, ...input })
  }
  if (node.type === 'ExportAllDeclaration') assertNoExportAll(node)
  return undefined
}

// import() of a collection can sit anywhere in the module, not only at the
// top level.
function assertNoDynamicImport(program: ESTree.Program): void {
  let found: ImportError | undefined
  new Visitor({
    ImportExpression(node) {
      const { source } = node
      if (found || source.type !== 'Literal') return
      const collection =
        typeof source.value === 'string'
          ? collectionOfImport(source.value)
          : undefined
      if (collection === undefined) return
      found = importError({
        message: unsupportedImport({ collection, form: 'dynamic' }),
        position: node.start
      })
    }
  }).visit(program)
  if (found) throw found
}

export type ExportRequest = {
  collection: string
  exportName: string
  // The offset of the export name in the module, for the error frame.
  position: number
}

export type RewrittenModule = { code: string; map: SourceMap }

// The imports by export name of a collection become imports of one icon
// each, so the build sees the same modules as imports written by path.
export async function rewriteImports({
  code,
  id,
  resolveIcon
}: RewriteInput): Promise<RewrittenModule | undefined> {
  const { program, errors } = await parse(id, code, { lang: langOf(id) })
  // The compiler of the application reports the syntax error.
  if (errors.length > 0) return undefined
  const edits = await inOrder(
    program.body.map(node => rewriteStatement({ node, code, resolveIcon }))
  )
  assertNoDynamicImport(program)
  const changes = edits.filter(edit => edit !== undefined)
  if (changes.length === 0) return undefined
  const output = new MagicString(code)
  for (const { start, end, text } of changes) output.overwrite(start, end, text)
  return {
    code: output.toString(),
    map: output.generateMap({
      hires: 'boundary',
      source: id,
      includeContent: true
    })
  }
}
