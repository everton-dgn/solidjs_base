import { editTemplate } from '../edit-template.ts'

const headerCases = `[
  { header: '', locale: testLanguages.base },
  { header: \`invalid_tag;q=1, \${testLanguages.alternate};q=0\`, locale: testLanguages.base },
  { header: \`\${testLanguages.alternate};q=0.000, \${testLanguages.base};q=0\`, locale: testLanguages.base },
  { header: \`invalid_tag ; Q = 0, \${testLanguages.alternate} ; q = 0.4\`, locale: testLanguages.alternate },
  { header: \`invalid_tag;q=NaN, \${testLanguages.alternate};q=0.5\`, locale: testLanguages.alternate }
]`

export function configureNegotiationTests(
  file: string,
  source: string
): string {
  let text = editTemplate({
    file,
    text: source,
    pattern: /for \(const \{ header, locale \} of \[\n[\s\S]*?\n\]\)/u,
    replacement: `for (const { header, locale } of ${headerCases})`
  })
  text = editTemplate({
    file,
    text,
    pattern: "'es-AR, en;q=0.5'",
    replacement: `\`\${testLanguages.third}, \${testLanguages.base};q=0.5\``
  })
  return text
    .replaceAll("'accept-language': 'de'", "'accept-language': 'invalid_tag'")
    .replaceAll(
      "'accept-language': 'de-DE'",
      "'accept-language': 'invalid_tag'"
    )
}
