import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { editTemplate } from '../edit-template.ts'
import { removeFeatureFiles } from '../removeFeatureFiles/index.ts'

type FontEdit = {
  target: string
  edits: readonly (readonly [RegExp, string])[]
}

function edit({ target, edits }: FontEdit) {
  let text = readFileSync(target, 'utf8')
  for (const [pattern, replacement] of edits) {
    text = editTemplate({ file: target, text, pattern, replacement })
  }
  writeFileSync(target, text)
}

type FontSelection = { stage: string; hasFonts?: boolean | undefined }

export function configureFonts({ stage, hasFonts }: FontSelection): void {
  if (hasFonts !== false) return
  removeFeatureFiles({ stage, disabled: ['fonts'] })
  const assets = path.join(
    stage,
    'src/tests/pages/BuildOutput/BuildOutput.assets.production.e2e.test.ts'
  )
  if (existsSync(assets)) {
    edit({
      target: assets,
      edits: [
        [/,\n {2}\{ extension: '\.woff2', contentType: '' \}/u, ''],
        [/\/\/ The type of the hit[^\n]+\n/u, '']
      ]
    })
  }
  edit({
    target: path.join(stage, 'vite.config.ts'),
    edits: [
      [/^import \{ FONTS \} from '\.\/fonts\.ts'\n/mu, ''],
      [/^ {2}fonts: FONTS,\n/mu, '']
    ]
  })
  edit({
    target: path.join(stage, 'src/Document.tsx'),
    edits: [
      [/^import \{ FontLinks \}[^\n]*\n/mu, ''],
      [/^ {8}<FontLinks \/>\n/mu, '']
    ]
  })
  edit({
    target: path.join(stage, 'src/theme/tokens/fonts.css'),
    edits: [[/'Inter', /u, '']]
  })
  edit({
    target: path.join(stage, 'AGENTS.md'),
    edits: [[/\n## Font loading\n[\s\S]*?(?=\n## |$)/u, '']]
  })
  edit({
    target: path.join(stage, 'docs/ui.md'),
    edits: [[/^## Fonts\n[\s\S]*?(?=^## )/mu, '']]
  })
  edit({
    target: path.join(stage, 'docs/security.md'),
    edits: [[/^The font preset [\s\S]*?(?=^## HSTS)/mu, '']]
  })
}
