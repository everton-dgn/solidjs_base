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
        for (const {
          fonts: hasFonts,
          icons: hasIcons,
          theme: hasTheme
        } of uiProfiles()) {
          yield { pm, ...variant, hasDiagnostics, hasFonts, hasIcons, hasTheme }
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
  mkdirSync(inputs)
  try {
    for (const profile of guideProfiles()) {
      generateSource(
        { dir, ...profile, shouldInitGit: false, shouldInstall: false },
        stage => {
          for (const file of guideFiles(stage)) {
            const content = readFileSync(path.join(stage, file), 'utf8')
            const digest = guideDigest(content)
            if (seen.has(digest)) continue
            seen.set(digest, content)
            writeFileSync(path.join(inputs, `${digest}.md`), content)
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
    for (const [key, input] of seen) {
      const output = readFileSync(path.join(inputs, `${key}.md`), 'utf8')
      if (input !== output) prepared[key] = output
    }
    writeFileSync('dist/prepared-guides.json', JSON.stringify(prepared))
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
}
