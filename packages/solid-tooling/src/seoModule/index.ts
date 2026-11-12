import path from 'node:path'

import { defineRule, type ESTree } from 'vite-plus/lint/plugins'

import {
  readStaticSpecifier,
  resolveProjectPath
} from '../lint/import-specifier.ts'

const SEO_MODULE = /^src\/routes\/(?:.+\/)?seo\.ts$/u
const LOCAL_SPECIFIER = /^\.{1,2}(?:\/|$)/u
const SEO_EXPORT = 'seo'
const ROUTES_DIR = 'src/routes/'

type ValueImport = ESTree.ImportDeclaration | ESTree.ImportExpression

function isImportMetaGlob({
  computed,
  object,
  property
}: ESTree.MemberExpression): boolean {
  return (
    !computed &&
    object.type === 'MetaProperty' &&
    object.meta.name === 'import' &&
    object.property.name === 'meta' &&
    property.type === 'Identifier' &&
    property.name === 'glob'
  )
}

// The route manifest imports the `route` of every page into the initial bundle,
// and everything `seo.ts` imports or exports goes with it. So it only exports
// `seo` and never imports local modules as values: the page body, which holds
// the text in every language, stays in `index.tsx`.
export const seoModule = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      onlySeo:
        'seo.ts exports only the seo object. The page body stays in index.tsx, because seo.ts reaches the initial bundle through route (see the page modules section of AGENTS.md).',
      localImport:
        'seo.ts must not import local modules as values: whatever it imports reaches the initial bundle with route. Keep the page body in index.tsx (see the page modules section of AGENTS.md).',
      computedImport:
        'seo.ts must not use import() with a computed path: the rule cannot tell whether the target is local. Keep the page body in index.tsx (see the page modules section of AGENTS.md).',
      globImport:
        'seo.ts must not use import.meta.glob: Vite turns it into imports of every module the pattern matches. Keep the page body in index.tsx (see the page modules section of AGENTS.md).'
    }
  },
  create(context) {
    const relative = path
      .relative(context.cwd, context.filename)
      .split(path.sep)
      .join('/')
    if (!SEO_MODULE.test(relative)) return {}

    // An alias into the routes tree pulls in the page module just like a
    // relative path does.
    const reportLocalImport = (node: ValueImport) => {
      const specifier = readStaticSpecifier(node)
      if (specifier === undefined) {
        context.report({ node, messageId: 'computedImport' })
        return
      }
      const target = resolveProjectPath({
        specifier,
        filename: context.filename,
        root: context.cwd
      })
      if (LOCAL_SPECIFIER.test(specifier) || target.startsWith(ROUTES_DIR)) {
        context.report({ node, messageId: 'localImport' })
      }
    }

    return {
      ExportNamedDeclaration(node) {
        const { declaration } = node
        if (declaration?.type === 'VariableDeclaration') {
          const isSeoOnly = declaration.declarations.every(
            ({ id }) => id.type === 'Identifier' && id.name === SEO_EXPORT
          )
          if (isSeoOnly) return
        }
        context.report({ node, messageId: 'onlySeo' })
      },
      ExportDefaultDeclaration(node) {
        context.report({ node, messageId: 'onlySeo' })
      },
      ExportAllDeclaration(node) {
        context.report({ node, messageId: 'onlySeo' })
      },
      ImportDeclaration(node) {
        if (node.importKind !== 'type') reportLocalImport(node)
      },
      ImportExpression(node) {
        reportLocalImport(node)
      },
      MemberExpression(node) {
        if (isImportMetaGlob(node)) {
          context.report({ node, messageId: 'globImport' })
        }
      }
    }
  }
})
