import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { format } from '../src/rewrite.ts'
import { iconEdits, iconReadmeEdits } from './icon-edits.ts'

function prepareFile(
  input: { source: string; output: string },
  edits: typeof iconReadmeEdits
): void {
  let content = readFileSync(input.source, 'utf8')
  for (const [pattern, replacement] of edits) {
    if (!pattern.test(content)) {
      throw new Error(`Missing icon edit in ${input.source}: ${pattern}`)
    }
    content = content.replace(pattern, replacement)
  }
  const file = path.basename(input.output)
  mkdirSync(path.dirname(input.output), { recursive: true })
  writeFileSync(
    input.output,
    file === '_gitignore' || file === 'AGENTS.md'
      ? content
      : format(file, content)
  )
}

export function buildIconProfile(): void {
  for (const [file, edits] of Object.entries(iconEdits)) {
    const name = file
    prepareFile(
      {
        source: path.join('template', file),
        output: path.join('dist/without-icons/files', name)
      },
      edits
    )
  }
  for (const pm of ['bun', 'pnpm', 'npm']) {
    const source = path.join('dist/profiles', pm, 'README.md')
    for (const icons of [true, false]) {
      for (const fonts of [true, false]) {
        if (icons && fonts) continue
        const edits = [...(icons ? [] : iconReadmeEdits)]
        if (!fonts) {
          const description = icons
            ? 'Validated `env.ts` and SVG icons from the Hugeicons and application collections.'
            : 'Validated application environment variables in `env.ts`.'
          edits.push(
            [
              /^\| Env[^\n]*Inter subsets[^\n]*$/mu,
              `| Environment | ${description} | See \`env.ts\`. | [Architecture](docs/architecture.md) |`
            ],
            [
              /CSS rules(?:, icons)? and fonts/u,
              icons ? 'CSS rules and icons' : 'CSS rules'
            ]
          )
        }
        const output = path.join(
          'dist/readmes',
          pm,
          `icons-${icons}-fonts-${fonts}`,
          'README.md'
        )
        prepareFile({ source, output }, edits)
      }
    }
  }
}
