import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { generateSource } from '../src/generate.ts'
import { guideDigest, guideFiles } from '../src/prepared-guides.ts'
import { plainSourceFiles } from '../src/prepared-source.ts'
import { uiProfiles } from './ui-profiles.ts'

function* modeVariants() {
  for (const mode of ['server', 'static', 'client'] as const) {
    for (const hasSeo of mode === 'client' ? [false] : [true, false]) {
      yield { mode, hasSeo }
    }
  }
}

function* guideProfiles() {
  for (const pm of ['bun', 'npm', 'pnpm'] as const) {
    for (const variant of modeVariants()) {
      for (const hasDiagnostics of [true, false]) {
        for (const { hasFonts, hasIcons, hasTheme } of uiProfiles()) {
          const profile = {
            pm,
            ...variant,
            hasDiagnostics,
            hasFonts,
            hasIcons,
            hasTheme
          }
          yield { ...profile, hasI18n: true }
          yield { ...profile, hasI18n: false }
        }
      }
    }
  }
}

export function prepareGuides(): void {
  const sandbox = mkdtempSync(path.join(tmpdir(), 'solid-guide-variants-'))
  const dir = path.join(sandbox, 'application')
  const inputs = path.join(sandbox, 'inputs')
  const seen = new Map<string, string>()
  const prepared: Record<string, string> = {}
  const sources = new Map<string, { original: string; file: string }>()
  const formattedSource: Record<string, string> = {}
  mkdirSync(inputs)
  try {
    for (const profile of guideProfiles()) {
      generateSource(
        { dir, ...profile, shouldInitGit: false, shouldInstall: false },
        {
          guides: stage => {
            for (const file of ['AGENTS.md', ...guideFiles(stage)]) {
              const content = readFileSync(path.join(stage, file), 'utf8')
              const digest = guideDigest(content)
              if (file === 'AGENTS.md') {
                prepared[digest] = content
                continue
              }
              if (seen.has(digest)) continue
              seen.set(digest, content)
              writeFileSync(path.join(inputs, `${digest}.md`), content)
            }
          },
          source: (stage, files = plainSourceFiles(stage)) => {
            for (const file of files) {
              const original = readFileSync(file, 'utf8')
              const digest = guideDigest(original)
              if (sources.has(digest)) continue
              const target = path.join(inputs, digest, path.basename(file))
              mkdirSync(path.dirname(target))
              writeFileSync(target, original)
              sources.set(digest, { original, file: target })
            }
          }
        }
      )
      rmSync(dir, { recursive: true })
    }
    execFileSync(
      path.resolve('../../node_modules/.bin/vp'),
      [
        'fmt',
        '--config',
        path.resolve('dist/formatter/vite.config.mjs'),
        inputs
      ],
      { cwd: process.cwd() }
    )
    for (const key of seen.keys()) {
      const output = readFileSync(path.join(inputs, `${key}.md`), 'utf8')
      prepared[key] = output
    }
    for (const [digest, { file, original }] of sources) {
      const content = readFileSync(file, 'utf8')
      if (content !== original) formattedSource[digest] = content
    }
    writeFileSync('dist/prepared-source.json', JSON.stringify(formattedSource))
    writeFileSync('dist/prepared-guides.json', JSON.stringify(prepared))
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
}
