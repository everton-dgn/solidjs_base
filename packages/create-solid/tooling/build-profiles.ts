import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { format } from '../src/rewrite.ts'
import { uiProfiles } from './feature-combinations.ts'
import { iconEdits, iconReadmeEdits } from './icon-edits.ts'
import { staticEdits, staticThemeDocument } from './static-edits.ts'
import { themeEdits, themeReadmeEdits } from './theme-edits.ts'
import { themeGuideEdits, themeIconGuideEdit } from './theme-guide-edits.ts'

function prepareFile(
  input: { source: string; output: string },
  edits: typeof iconReadmeEdits
): void {
  let content = readFileSync(input.source, 'utf8')
  for (const [pattern, replacement] of edits) {
    if (!pattern.test(content)) {
      throw new Error(`Missing feature edit in ${input.source}: ${pattern}`)
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

function buildReadmes(): void {
  for (const pm of ['bun', 'pnpm', 'npm']) {
    const source = path.join('dist/profiles', pm, 'README.md')
    for (const { icons, fonts, theme } of uiProfiles()) {
      if (icons && fonts && theme) continue
      const edits = [
        ...(icons ? [] : iconReadmeEdits),
        ...(theme ? [] : themeReadmeEdits)
      ]
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
        `icons-${icons}-fonts-${fonts}-theme-${theme}`,
        'README.md'
      )
      prepareFile({ source, output }, edits)
    }
  }
}

function buildStaticProfile(): void {
  for (const [file, edits] of Object.entries(staticEdits)) {
    prepareFile(
      {
        source: path.join('template', file),
        output: path.join('dist/static/files', file)
      },
      edits
    )
  }
  prepareFile(
    {
      source: 'template/src/Document.tsx',
      output: 'dist/static/theme/src/Document.tsx'
    },
    staticThemeDocument
  )
  const targets = {
    'playwright.config.ts': 'files/playwright.config.ts',
    'paraglide.config.ts': 'files/project.inlang/paraglide.config.ts',
    'theme.ts': 'theme/src/constants/theme.ts',
    'README.md': 'files/README.md',
    'serve-public.ts': 'files/tooling/testing/serve-public.ts'
  }
  for (const [file, target] of Object.entries(targets)) {
    prepareFile(
      {
        source: path.join('profiles/static', `${file}.tmpl`),
        output: path.join('dist/static', target)
      },
      []
    )
  }
}

export function buildProfiles(): void {
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
  for (const [file, edits] of Object.entries({
    ...themeEdits,
    ...themeGuideEdits
  })) {
    const shared = Object.hasOwn(iconEdits, file)
    for (const icons of shared ? [true, false] : [true]) {
      const source = path.join(
        icons ? 'template' : 'dist/without-icons/files',
        file
      )
      const output = path.join(
        'dist/without-theme',
        icons ? 'files' : 'without-icons',
        file
      )
      const changes =
        file === 'docs/ui.md' && icons ? [...edits, themeIconGuideEdit] : edits
      prepareFile({ source, output }, changes)
    }
  }
  buildReadmes()
  buildStaticProfile()
}
