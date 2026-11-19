import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

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

const previous = new Set(
  readFileSync('guide-edits.txt', 'utf8').trimEnd().split('\n')
)
const approved = new Map<string, Set<string>>()
function reviewManager(pm: string) {
  return guideOwnership(({ line, before, after }) => {
    const entry = `${pm} | ${line}`
    if (
      previous.has(line) ||
      previous.has(entry) ||
      approved.get(line)?.has(pm)
    ) {
      return
    }
    process.stdout.write(
      `${line}\nBefore\n${before ?? '(absent)'}\nAfter\n${after ?? '(absent)'}\n`
    )
  })
}
const managers = {
  bun: reviewManager('bun'),
  pnpm: reviewManager('pnpm'),
  npm: reviewManager('npm')
}
const sandbox = mkdtempSync(path.join(tmpdir(), 'solid-guide-approval-'))
try {
  for (const options of profiles()) {
    const dir = path.join(sandbox, 'app')
    const profile = {
      title: 'Solid Base application',
      ...options,
      dir,
      shouldInitGit: false,
      shouldInstall: false
    }
    generate(profile)
    for (const change of managers[profile.pm](profile)) {
      const seen = approved.get(change) ?? new Set<string>()
      seen.add(profile.pm)
      approved.set(change, seen)
    }
    rmSync(dir, { recursive: true })
  }
  const entries = [...approved].flatMap(([line, seen]) =>
    seen.size === Object.keys(managers).length
      ? [line]
      : [...seen].map(pm => `${pm} | ${line}`)
  )
  writeFileSync('guide-edits.txt', `${entries.toSorted().join('\n')}\n`)
} finally {
  rmSync(sandbox, { recursive: true, force: true })
}
