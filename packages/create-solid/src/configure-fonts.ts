import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { parse, object, record, string } from 'valibot'

function edit(target: string, edits: readonly (readonly [RegExp, string])[]) {
  let text = readFileSync(target, 'utf8')
  for (const [pattern, replacement] of edits) {
    if (!pattern.test(text)) throw new Error(`Missing font edit in ${target}`)
    text = text.replace(pattern, replacement)
  }
  writeFileSync(target, text)
}

export function removeFeatureFiles(stage: string, name: string): void {
  const schema = object({ files: record(string(), string()) })
  const manifest = new URL('../dist/features.json', import.meta.url)
  const { files } = parse(schema, JSON.parse(readFileSync(manifest, 'utf8')))
  for (const [file, feature] of Object.entries(files)) {
    if (feature === name) unlinkSync(path.join(stage, file))
  }
}

export function configureFonts(stage: string, fonts?: boolean): void {
  if (fonts !== false) return
  removeFeatureFiles(stage, 'fonts')
  edit(path.join(stage, 'vite.config.ts'), [
    [/^import \{ FONTS \} from '\.\/fonts\.ts'\n/mu, ''],
    [/^ {2}fonts: FONTS,\n/mu, '']
  ])
  edit(path.join(stage, 'src/Document.tsx'), [
    [/^import \{ FontLinks \}[^\n]*\n/mu, ''],
    [/^ {8}<FontLinks \/>\n/mu, '']
  ])
  edit(path.join(stage, 'src/theme/tokens/fonts.css'), [[/'Inter', /u, '']])
  edit(path.join(stage, 'AGENTS.md'), [
    [/\n## Font loading\n[\s\S]*?(?=\n## |$)/u, '']
  ])
  edit(path.join(stage, 'docs/ui.md'), [[/^## Fonts\n[\s\S]*?(?=^## )/mu, '']])
  edit(path.join(stage, 'docs/security.md'), [
    [/^The font preset [\s\S]*?(?=^## HSTS)/mu, '']
  ])
}
