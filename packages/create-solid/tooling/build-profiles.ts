import { execFileSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  CSP_DIRECTIVES,
  SECURITY_HEADERS
} from '../../solid-runtime/src/middleware/securityHeaders/constants.js'
import { editTemplate } from '../src/edit-template.ts'
import { uiProfiles } from './feature-combinations.ts'
import { iconEdits, iconReadmeEdits } from './icon-edits.ts'
import { staticEdits, staticThemeDocument } from './static-edits.ts'
import { themeEdits, themeReadmeEdits } from './theme-edits.ts'
import { themeGuideEdits, themeIconGuideEdit } from './theme-guide-edits.ts'

type FileVariant = { source: string; output: string }

const pendingFormats = new Set<string>()

function formatPending(): void {
  const sandbox = mkdtempSync(path.join(tmpdir(), 'solid-profile-format-'))
  try {
    const files = [...pendingFormats].map((output, index) => {
      const folder = path.join(sandbox, String(index))
      mkdirSync(folder)
      const input = path.join(folder, path.basename(output))
      cpSync(output, input)
      return { input, output }
    })
    execFileSync(path.resolve('../../node_modules/.bin/vp'), [
      'fmt',
      '--config',
      path.resolve('dist/formatter/vite.config.mjs'),
      sandbox
    ])
    for (const { input, output } of files) cpSync(input, output)
    pendingFormats.clear()
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
}

function prepareFile(input: FileVariant, edits: typeof iconReadmeEdits): void {
  let content = readFileSync(input.source, 'utf8')
  for (const [pattern, replacement] of edits) {
    content = editTemplate({
      file: input.source,
      text: content,
      pattern,
      replacement
    })
  }
  const file = path.basename(input.output)
  mkdirSync(path.dirname(input.output), { recursive: true })
  writeFileSync(input.output, content)
  if (file !== '_gitignore' && file !== 'AGENTS.md') {
    pendingFormats.add(input.output)
  }
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

function buildClientTheme(): void {
  const source = 'profiles/static/theme.ts.tmpl'
  prepareFile(
    { source, output: 'dist/client/theme/src/constants/theme-options.ts' },
    [
      [/^[\s\S]*?const options = /u, 'export const themeOptions = '],
      [/\nexport const \{ createTheme[\s\S]*$/u, '\n']
    ]
  )
  prepareFile({ source, output: 'dist/client/theme/src/constants/theme.ts' }, [
    [/^import \{ storedThemeScript[^\n]+\n/mu, ''],
    [
      /const options = \{[\s\S]*?\} as const/u,
      "import { themeOptions } from './theme-options.ts'"
    ],
    [/, themeColor, defaultTheme: DEFAULT_THEME/u, ''],
    [/defineTheme\(options\)/u, 'defineTheme(themeOptions)'],
    [/^export const initialThemeScript[^\n]+\n/mu, '']
  ])
  prepareFile(
    {
      source: 'profiles/client/stored-theme.ts.tmpl',
      output: 'dist/client/theme/tooling/stored-theme.ts'
    },
    []
  )
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
    'README.md': 'publishing.md',
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
  formatPending()
  for (const [file, edits] of Object.entries({
    ...themeEdits,
    ...themeGuideEdits
  })) {
    const isShared = Object.hasOwn(iconEdits, file)
    for (const icons of isShared ? [true, false] : [true]) {
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
  buildClientTheme()
  for (const mode of ['static', 'client']) {
    const scripts =
      mode === 'static'
        ? "script-src 'self' {page-hashes}"
        : "script-src 'self'"
    const headers = [
      `Content-Security-Policy: ${[...CSP_DIRECTIVES, scripts].join('; ')}`,
      ...Object.entries(SECURITY_HEADERS).map(
        ([name, value]) => `${name}: ${value}`
      )
    ]
    const guidance =
      mode === 'static'
        ? 'Replace `{page-hashes}` with the quoted hashes for the HTML file served, including error pages.'
        : 'Serve missing asset requests with status 404. Direct page URLs require a host with an HTML fallback.'
    const content = `## Host response headers\n\n${guidance}\n\n\`\`\`http\n${headers.join('\n')}\n\`\`\`\n\nServe .md files with \`Content-Type: text/markdown; charset=utf-8\`.\n`
    const output = path.join('dist', `headers-${mode}.md`)
    writeFileSync(output, content)
    pendingFormats.add(output)
  }
  formatPending()
}
