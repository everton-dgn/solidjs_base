import { accessSync, constants, readFileSync } from 'node:fs'
import path from 'node:path'

import { message, type Language } from '../cli-language.ts'
import type { Profile } from '../types.ts'

export type SetupCommand = {
  task: 'gitTask' | 'installTask'
  executable: string
  args: string[]
}
export function* installProfile(
  profile: Profile,
  language: Language = 'en'
): Generator<SetupCommand, void> {
  if (!profile.shouldInstall) return
  const workspace = path.join(profile.dir, 'pnpm-workspace.yaml')
  const before =
    profile.pm === 'pnpm' ? readFileSync(workspace, 'utf8') : undefined
  try {
    yield { task: 'installTask', executable: profile.pm, args: ['install'] }
  } catch (error) {
    throw new Error(
      message(language, {
        code: 'installFailure',
        values: { dir: profile.dir, pm: profile.pm }
      }),
      { cause: error }
    )
  }
  if (before === undefined) return
  try {
    accessSync(path.join(profile.dir, 'node_modules/.bin/vp'), constants.X_OK)
    const installed = readFileSync(workspace, 'utf8')
    if (installed === before) return
    yield {
      task: 'installTask',
      executable: path.join(profile.dir, 'node_modules/.bin/vp'),
      args: ['fmt', 'pnpm-workspace.yaml']
    }
  } catch (error) {
    throw new Error(message(language, { code: 'formatFailure', values: {} }), {
      cause: error
    })
  }
}
