import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { editTemplate } from '../edit-template.ts'
import type { StagedContext } from '../generate.ts'

type GuideChange = { pattern: RegExp; replacement: string }

export function configureStandaloneGuides({
  stage,
  profile
}: StagedContext): void {
  const change = (name: string, changes: GuideChange[]) => {
    const file = path.join(stage, name)
    let text = readFileSync(file, 'utf8')
    for (const edit of changes) text = editTemplate({ file, text, ...edit })
    writeFileSync(file, text)
  }
  const server = (profile.mode ?? 'server') === 'server'
  change('AGENTS.md', [
    {
      pattern: /Before changing code, run `vp run doctor`\./u,
      replacement: 'Before changing code, run the doctor command below.'
    },
    { pattern: /If the Vite config fails to load, run /u, replacement: 'Run ' }
  ])
  change('docs/development.md', [
    {
      pattern:
        /Use `vp run tsrs`, `vp run knip`, `vp run playwright`, `vp run lefthook` and\n`vp run commitlint` for the package's executables\./u,
      replacement:
        'The tooling package provides the type checker, Knip, Playwright and Git hook tools.'
    },
    {
      pattern: /`vp run tsrs --noEmit` checks the whole program\./u,
      replacement:
        'The tsrs executable with `--noEmit` checks the whole program.'
    },
    {
      pattern: /`bun\.lock` is the\n {2}only lockfile of the project\./u,
      replacement: 'Keep the lockfile of the selected package manager.'
    }
  ])
  if (server) {
    change('docs/development.md', [
      {
        pattern: /TypeScript configs, `package.json`, `bun\.lock`/u,
        replacement:
          'TypeScript configs, `package.json`, the installer lockfile'
      },
      {
        pattern: /^## Runtimes and CI[\s\S]*?(?=^## Git hooks)/mu,
        replacement:
          '## Task runtimes\n\nBun runs the application tasks with any supported installer. Node runs the tooling tests.\n\n'
      }
    ])
    if (profile.hasSeo === false) {
      change('README.md', [
        {
          pattern: /, \[NotFound\]\(src\/tests\/pages\/NotFound\)/u,
          replacement: ''
        },
        { pattern: /^\| \[SSR integrity\][^\n]*\n/mu, replacement: '' }
      ])
      change('AGENTS.md', [
        {
          pattern:
            /\(docs\/server-errors\/backend.md\) or\n {2}\[SSR integrity\]\(docs\/server-errors\/ssr-integrity.md\)/u,
          replacement: '(docs/server-errors/backend.md)'
        }
      ])
    }
  } else {
    change('README.md', [
      {
        pattern:
          / In `vp run dev`, the first server HTML[\s\S]*?#styles-on-the-first-load-in-development\)\)\./u,
        replacement: ''
      }
    ])
  }
  change('AGENTS.md', [
    {
      pattern:
        /Check `package.json`, `bun.lock` and the workflow responsible for the tools\n {2}installed in the CI\./u,
      replacement:
        'Check `package.json` and the lockfile of the selected package manager.'
    }
  ])
}
