import path from 'node:path'

import { defineRule, type ESTree } from 'vite-plus/lint/plugins'

import { readStaticSpecifier } from '../lint/import-specifier.ts'
import {
  RELATIVE_IMPORT_RESTRICTION,
  RENDER_INTEGRITY_MODULE
} from './constants.ts'

type ImportNode =
  | ESTree.ImportDeclaration
  | ESTree.ExportNamedDeclaration
  | ESTree.ExportAllDeclaration
  | ESTree.ImportExpression
  | ESTree.TSImportType
type NamedImport = { node: ImportNode; names: string[] }

const RELATIVE_IMPORT = new RegExp(RELATIVE_IMPORT_RESTRICTION.regex, 'u')
const RENDER_INTEGRITY = new RegExp(RENDER_INTEGRITY_MODULE, 'u')
const TRANSPORTS = new Set(
  ['http', 'https', 'http2', 'net', 'tls', 'undici'].flatMap(name => [
    name,
    `node:${name}`
  ])
)
const SERVER_CONFIG = new Set([
  '@solidjs/web/server-functions',
  '@solidjs/web/server-functions/server',
  '@evertondgn/solid-runtime/server/configure-server-errors'
])

function importsName({ node, names }: NamedImport): boolean {
  if (node.type === 'TSImportType' && node.qualifier !== null) {
    let { qualifier } = node
    while (qualifier.type === 'TSQualifiedName') qualifier = qualifier.left
    return names.includes(qualifier.name)
  }
  if (
    node.type !== 'ImportDeclaration' &&
    node.type !== 'ExportNamedDeclaration'
  ) {
    return true
  }
  return node.specifiers.some(specifier => {
    if (specifier.type === 'ImportNamespaceSpecifier') return true
    if (specifier.type === 'ImportDefaultSpecifier') {
      return names.includes('default')
    }
    const imported =
      specifier.type === 'ImportSpecifier'
        ? specifier.imported
        : specifier.local
    return names.includes(
      imported.type === 'Identifier' ? imported.name : imported.value
    )
  })
}

function permission(options: unknown, name: string): boolean {
  return (
    typeof options === 'object' &&
    options !== null &&
    name in options &&
    Reflect.get(options, name) === true
  )
}

export function normalizeBackendSpecifier(specifier: string): string {
  const normalized = path.posix.normalize(specifier.replaceAll('\\', '/'))
  // Keep a relative specifier relative: ./@solidjs/web is not a package import.
  return specifier.startsWith('.') && !normalized.startsWith('.')
    ? `./${normalized}`
    : normalized
}

export const restrictedImports = defineRule({
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          allowSafeErrors: { type: 'boolean' },
          allowServerConfiguration: { type: 'boolean' },
          testFile: { type: 'boolean' }
        },
        additionalProperties: false
      }
    ],
    messages: {
      relative: RELATIVE_IMPORT_RESTRICTION.message,
      physical:
        'Do not import through node_modules. Use a public package export.',
      safe: 'Use createPublicError; only the runtime publicErrors module may mark an error as public.',
      configuration:
        'Only src/infra/server/configureServerErrors/index.ts may configure server errors or observe render failures.',
      transport:
        'Node transports cannot be imported in src/. Use requestJson or a protected server adapter.'
    }
  },
  create(context) {
    const [options] = context.options
    const safeErrors = permission(options, 'allowSafeErrors')
    const configuration = permission(options, 'allowServerConfiguration')
    const testFile = permission(options, 'testFile')

    function check(node: ImportNode): void {
      const original = readStaticSpecifier(node)
      if (original === undefined) return
      const specifier = normalizeBackendSpecifier(original)
      if (RELATIVE_IMPORT.test(specifier)) {
        context.report({ node, messageId: 'relative' })
      }
      if (testFile) return
      // Check the original segments too: normalization can erase node_modules/..
      if (original.replaceAll('\\', '/').split('/').includes('node_modules')) {
        context.report({ node, messageId: 'physical' })
      }
      if (TRANSPORTS.has(specifier)) {
        context.report({ node, messageId: 'transport' })
      }
      if (
        !safeErrors &&
        specifier === '@solidjs/web' &&
        importsName({ node, names: ['markSafeError', 'SAFE_ERROR'] })
      ) {
        context.report({ node, messageId: 'safe' })
      }
      if (
        !configuration &&
        (SERVER_CONFIG.has(specifier) ||
          (specifier === '@solidjs/web' &&
            importsName({ node, names: ['configureServerErrors'] })) ||
          (RENDER_INTEGRITY.test(specifier) &&
            importsName({ node, names: ['observeRenderFailures'] })))
      ) {
        context.report({ node, messageId: 'configuration' })
      }
    }
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
      TSImportType: check
    }
  }
})
