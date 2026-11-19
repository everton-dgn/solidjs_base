import path from 'node:path'

import { parseSync, Visitor } from 'oxc-parser'

type Edit = { start: number; end: number; text: string }
type Span = { start: number; end: number }

const segment = /\/(?<locale>en|es|pt)(?=$|[/?#\s"',)<\\])/gu
const importLine =
  "import { testLanguages } from '@/tests/helpers/scenarioLocales/index.ts'\n"
const localeCode = (role: string) => `\${testLanguages.${role}}`

export function prepareBrowserPaths(file: string, source: string): string {
  if (!file.endsWith('.e2e.test.ts')) return source
  const parsed = parseSync(file, source)
  if (parsed.errors.length > 0) throw new Error(`Invalid browser test: ${file}`)
  const redirected = /(?:I18n\.redirect|UiKit\.e2e)/u.test(path.basename(file))
  const roles: Record<string, string> = {
    en: 'base',
    pt: redirected ? 'base' : 'alternate',
    es: redirected ? 'alternate' : 'third'
  }
  const localize = (value: string) =>
    value.replaceAll(segment, match => {
      const role = roles[match.slice(1)]
      if (!role) throw new Error(`Unknown locale in ${file}: ${match}`)
      return `/${localeCode(role)}`
    })
  const changes: Edit[] = []
  const callbacks: { body: Span; close: number }[] = []
  const replace = ({ start, end }: Span, text: string) => {
    changes.push({ start, end, text })
  }
  new Visitor({
    CallExpression(node) {
      const { callee } = node
      if (
        callee.type !== 'MemberExpression' ||
        callee.property.type !== 'Identifier' ||
        callee.property.name !== 'evaluate'
      ) {
        return
      }
      const [callback] = node.arguments
      if (
        callback?.type === 'ArrowFunctionExpression' &&
        node.arguments.length === 1 &&
        callback.params.length === 0
      ) {
        callbacks.push({ body: callback, close: node.end - 1 })
      }
    },
    Literal(node) {
      if (typeof node.value === 'string') {
        const { value } = node
        if (localize(value) === value) return
        const escaped = JSON.stringify(value)
          .slice(1, -1)
          .replaceAll('`', '\\`')
          .replaceAll('${', '\\${')
        replace(node, `\`${localize(escaped)}\``)
      } else if ('regex' in node) {
        const { pattern, flags } = node.regex
        const localized = localize(pattern)
        if (pattern !== localized) {
          replace(node, `new RegExp(String.raw\`${localized}\`, '${flags}')`)
        }
      }
    },
    TemplateElement(node) {
      const { raw } = node.value
      const localized = localize(raw)
      if (raw !== localized) {
        replace(
          { start: node.start + 1, end: node.start + 1 + raw.length },
          localized
        )
      }
    }
  }).visit(parsed.program)
  if (changes.length === 0) return source
  for (const { body, close } of callbacks) {
    if (
      !changes.some(
        change => change.start >= body.start && change.end <= body.end
      )
    ) {
      continue
    }
    for (const change of changes) {
      if (change.start >= body.start && change.end <= body.end) {
        change.text = change.text.replaceAll('testLanguages.', 'pageLanguages.')
      }
    }
    if (!source.startsWith('()', body.start)) {
      throw new Error(`Review the evaluate callback in ${file}`)
    }
    replace(
      { start: body.start, end: body.start + '()'.length },
      'pageLanguages'
    )
    replace(
      { start: close, end: close },
      ', { base: testLanguages.base, alternate: testLanguages.alternate, third: testLanguages.third }'
    )
  }
  let result = source
  for (const { start, end, text } of changes.toSorted(
    (a, b) => b.start - a.start
  )) {
    result = result.slice(0, start) + text + result.slice(end)
  }
  return importLine + result
}
