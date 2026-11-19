import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { generate } from '../src/generate.ts'
import { guideFiles } from '../src/prepared-guides.ts'
import type { Profile } from '../src/types.ts'

type Sections = Map<string, string>
type GuideState = { profile: Profile; sections: Sections }
type Transition = { owner: string; parent: Profile }
const switches = [
  ['hasFonts', 'configureFonts'],
  ['hasIcons', 'configureIcons'],
  ['hasTheme', 'configureTheme'],
  ['hasDiagnostics', 'configureDiagnostics'],
  ['hasSeo', 'configureSeo']
] as const

function signature(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}

function profileKey(profile: Profile): string {
  return JSON.stringify([
    profile.pm,
    profile.mode ?? 'server',
    ...switches.map(([key]) => profile[key] !== false)
  ])
}

function parentProfile(profile: Profile): Transition | undefined {
  for (const [key, owner] of switches) {
    if (
      profile[key] !== false ||
      (key === 'hasSeo' && profile.mode === 'client')
    ) {
      continue
    }
    return { owner, parent: { ...profile, [key]: true } }
  }
  if (profile.mode === 'client' || profile.mode === 'static') {
    return {
      owner: profile.mode === 'client' ? 'configureClient' : 'configureStatic',
      parent: { ...profile, mode: 'server' }
    }
  }
  return undefined
}

function readSections(dir: string): Sections {
  const sections = new Map<string, string>()
  for (const file of ['AGENTS.md', ...guideFiles(dir)]) {
    const content = readFileSync(path.join(dir, file), 'utf8')
    const names: string[] = []
    for (const section of content.split(/(?=^#{1,3} )/mu)) {
      const title = section.split('\n', 1)[0] ?? ''
      const name = title.startsWith('#') ? title : '(introduction)'
      let key = `${file} | ${name}`
      while (sections.has(key)) key += ' (repeated)'
      names.push(key)
      sections.set(key, signature(section))
    }
    sections.set(`${file} | (section order)`, signature(JSON.stringify(names)))
  }
  return sections
}

function generatedParent(profile: Profile): Sections {
  const dir = mkdtempSync(path.join(tmpdir(), 'solid-guide-parent-'))
  try {
    generate({ ...profile, dir })
    return readSections(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// Each edge changes one feature. Following the parent edges reaches the full
// server profile for the same installer, including from the client profile.
export function guideOwnership(): (profile: Profile) => string[] {
  const profiles = new Map<string, Sections>()
  function changed({ profile, sections }: GuideState): string[] {
    profiles.set(profileKey(profile), sections)
    const transition = parentProfile(profile)
    if (!transition) return []
    const key = profileKey(transition.parent)
    const parent = profiles.get(key) ?? generatedParent(transition.parent)
    profiles.set(key, parent)
    const changes: string[] = []
    for (const section of new Set([...parent.keys(), ...sections.keys()])) {
      const before = parent.get(section)
      const after = sections.get(section)
      if (before === after) continue
      changes.push(
        `${transition.owner} | ${section} | ${signature(JSON.stringify([before, after]))}`
      )
    }
    return changes
  }
  return (profile: Profile) =>
    changed({ profile, sections: readSections(profile.dir) })
}
