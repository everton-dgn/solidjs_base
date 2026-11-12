import { defineRule } from 'vite-plus/lint/plugins'

// Exports stay on the declaration itself. A list without `from` separates the
// exported name from its declaration; a re-export with `from` is still allowed
// because there is no local declaration to mark.
export const noExportList = defineRule({
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      inlineExport:
        'Export on the declaration itself (export function, export const, export type) instead of using export { ... }. An export list is only allowed in a re-export with from.'
    }
  },
  create(context) {
    return {
      ExportNamedDeclaration(node) {
        if (node.declaration || node.source) return
        context.report({ node, messageId: 'inlineExport' })
      }
    }
  }
})
