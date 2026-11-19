import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { generate } from '../src/generate.ts'
import { guideOwnership } from './guide-ownership.ts'
import { uiProfiles } from './ui-profiles.ts'

function* publications() {
  for (const mode of ['server', 'static', 'client'] as const) {
    for (const hasSeo of mode === 'client' ? [false] : [true, false]) {
      yield { mode, hasSeo }
    }
  }
}
function* profiles() {
  for (const publication of publications()) {
    for (const pm of ['bun', 'npm', 'pnpm'] as const) {
      for (const hasDiagnostics of [true, false]) {
        for (const {
          fonts: hasFonts,
          theme: hasTheme,
          icons: hasIcons
        } of uiProfiles()) {
          yield {
            ...publication,
            pm,
            hasDiagnostics,
            hasIcons,
            hasFonts,
            hasTheme
          }
        }
      }
    }
  }
}

const transitions = guideOwnership()
const approved = new Set<string>()
const sandbox = mkdtempSync(path.join(tmpdir(), 'solid-guide-approval-'))
try {
  for (const options of profiles()) {
    const dir = path.join(sandbox, 'app')
    const profile = {
      ...options,
      dir,
      shouldInitGit: false,
      shouldInstall: false
    }
    generate(profile)
    for (const change of transitions(profile)) approved.add(change)
    rmSync(dir, { recursive: true })
  }
  writeFileSync('guide-edits.txt', `${[...approved].toSorted().join('\n')}\n`)
} finally {
  rmSync(sandbox, { recursive: true, force: true })
}
