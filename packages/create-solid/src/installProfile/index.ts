import { execFileSync } from 'node:child_process'
import { accessSync, constants, readFileSync } from 'node:fs'
import path from 'node:path'

import type { Profile } from '../types.ts'

export function installProfile(profile: Profile): void {
  if (!profile.shouldInstall) return
  const workspace = path.join(profile.dir, 'pnpm-workspace.yaml')
  const before =
    profile.pm === 'pnpm' ? readFileSync(workspace, 'utf8') : undefined
  try {
    execFileSync(profile.pm, ['install'], {
      cwd: profile.dir,
      stdio: 'inherit'
    })
  } catch (error) {
    throw new Error(
      `Open ${profile.dir} and run ${profile.pm} install again.`,
      { cause: error }
    )
  }
  if (before === undefined) return
  try {
    accessSync(path.join(profile.dir, 'node_modules/.bin/vp'), constants.X_OK)
    const installed = readFileSync(workspace, 'utf8')
    if (installed === before) return
    execFileSync(
      path.join(profile.dir, 'node_modules/.bin/vp'),
      ['fmt', 'pnpm-workspace.yaml'],
      {
        cwd: profile.dir,
        stdio: 'inherit'
      }
    )
  } catch (error) {
    throw new Error(
      'pnpm installed dependencies. Check the local Vite+ installation and run pnpm exec vp fmt pnpm-workspace.yaml in the application.',
      { cause: error }
    )
  }
}
