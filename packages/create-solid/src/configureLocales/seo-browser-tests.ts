import { readFileSync } from 'node:fs'
import path from 'node:path'

import { editTemplate } from '../edit-template.ts'
import type { StagedContext } from '../types.ts'

export function configureSeoBrowserTests({
  stage,
  write
}: StagedContext): void {
  const edits = [
    [
      'Home/Home.seo',
      "  test('publishes the type, image and JSON-LD declared by the route'",
      "})\n\ntest.describe('Structured data', () => {\n  test('publishes the type, image and JSON-LD declared by the route'"
    ],
    [
      'SeoIndexes/SeoIndexes',
      'Content is available in English (/en), Portuguese (/pt), and Spanish (/es). This index uses English.',
      `\${testLanguages.availability}`
    ],
    [
      'SeoIndexes/SeoIndexes.production',
      "'This index uses English.'",
      'testLanguages.indexNote'
    ]
  ] as const
  for (const [name, pattern, replacement] of edits) {
    const file = `src/tests/pages/${name}.e2e.test.ts`
    const text = readFileSync(path.join(stage, file), 'utf8')
    write({
      file,
      content: editTemplate({
        file,
        text,
        pattern,
        replacement: () => replacement
      })
    })
  }
}
