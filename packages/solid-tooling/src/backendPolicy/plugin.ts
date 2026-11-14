import { definePlugin, defineRule } from 'vite-plus/lint/plugins'

import { readStaticSpecifier } from '../lint/import-specifier.ts'
import { RENDER_INTEGRITY_MODULE } from './constants.ts'
import { normalizeBackendSpecifier, restrictedImports } from './imports.ts'

type StaticImportRule = {
  matches: (specifier: string) => boolean
  message: string
}

const RENDER_INTEGRITY = new RegExp(RENDER_INTEGRITY_MODULE, 'u')

// Name-based restrictions do not reach import(): the whole module would come
// through it without going through the list of allowed names.
function staticImportRule({ matches, message }: StaticImportRule) {
  return defineRule({
    meta: {
      type: 'problem',
      schema: [],
      messages: { staticImport: message }
    },
    create(context) {
      return {
        ImportExpression(node) {
          const specifier = readStaticSpecifier(node)
          if (
            specifier !== undefined &&
            matches(normalizeBackendSpecifier(specifier))
          ) {
            context.report({ node, messageId: 'staticImport' })
          }
        }
      }
    }
  })
}

const backendPlugin = definePlugin({
  meta: { name: 'backend' },
  rules: {
    'restricted-imports': restrictedImports,
    'no-setup-exports': defineRule({
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          exported:
            'Server setup must not export anything. Import it only for its setup side effects.'
        }
      },
      create(context) {
        return {
          ExportNamedDeclaration: node =>
            context.report({ node, messageId: 'exported' }),
          ExportDefaultDeclaration: node =>
            context.report({ node, messageId: 'exported' }),
          ExportAllDeclaration: node =>
            context.report({ node, messageId: 'exported' }),
          TSExportAssignment: node =>
            context.report({ node, messageId: 'exported' })
        }
      }
    }),
    'static-solid-imports': staticImportRule({
      matches: specifier =>
        specifier === '@solidjs/web' ||
        specifier.startsWith('@solidjs/web/') ||
        specifier ===
          '@evertondgn/solid-runtime/server/configure-server-errors',
      message:
        'Use a static import for @solidjs/web, its subpaths and the runtime server configurator: the import restrictions on markSafeError and configureServerErrors cannot check import().'
    }),
    'static-render-integrity-imports': staticImportRule({
      matches: specifier => RENDER_INTEGRITY.test(specifier),
      message:
        'Use a static import for renderIntegrity: the import restriction on observeRenderFailures cannot check import().'
    })
  }
})

export default backendPlugin
