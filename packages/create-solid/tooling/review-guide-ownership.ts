import { spawnSync } from 'node:child_process'
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
        for (const { hasFonts, hasTheme, hasIcons } of uiProfiles()) {
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
const approved = new Set<string>()
const sandbox = mkdtempSync(path.join(tmpdir(), 'solid-guide-approval-'))
function reviewManager(pm: string) {
  return guideOwnership(({ line, before, after }) => {
    const entry = `${pm} | ${line}`
    if (previous.has(entry) || approved.has(entry)) return
    const files = ['before', 'after']
    writeFileSync(path.join(sandbox, 'before'), before ?? '')
    writeFileSync(path.join(sandbox, 'after'), after ?? '')
    const diff = spawnSync('diff', ['-u', ...files], {
      cwd: sandbox,
      encoding: 'utf8'
    })
    if (diff.status !== 1 && !(diff.status === 0 && before !== after)) {
      throw diff.error ?? new Error(diff.stderr)
    }
    process.stdout.write(`${entry}\n${diff.stdout}`)
  })
}
const managers = {
  bun: reviewManager('bun'),
  pnpm: reviewManager('pnpm'),
  npm: reviewManager('npm')
}
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
      approved.add(`${profile.pm} | ${change}`)
    }
    rmSync(dir, { recursive: true })
  }
  writeFileSync('guide-edits.txt', `${[...approved].toSorted().join('\n')}\n`)
} finally {
  rmSync(sandbox, { recursive: true, force: true })
}
