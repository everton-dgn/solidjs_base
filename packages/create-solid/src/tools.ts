import { accessSync, constants, lstatSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { message, type Language } from './cli-language.ts'
import type { Profile } from './types.ts'

type ToolCheck = { profile: Profile; language: Language }
const links = {
  git: 'https://git-scm.com/downloads',
  bun: 'https://bun.sh',
  pnpm: 'https://pnpm.io/installation',
  npm: 'https://nodejs.org/download'
}
export const toolNames = { bun: 'Bun', git: 'Git', npm: 'npm', pnpm: 'pnpm' }
type Tool = keyof typeof links

export function hasTool(tool: Tool): boolean {
  return (process.env.PATH ?? '').split(path.delimiter).some(directory => {
    const file = path.join(directory, tool)
    try {
      accessSync(file, constants.X_OK)
      return statSync(file).isFile()
    } catch {
      return false
    }
  })
}
export function missingTool(tool: Tool, language: Language): string {
  return message(language, {
    code: 'tool',
    values: { tool: toolNames[tool], link: links[tool] }
  })
}

export function hasRepository(dir: string | undefined): boolean {
  if (!dir) return false
  return (
    lstatSync(path.join(dir, '.git'), { throwIfNoEntry: false }) !== undefined
  )
}
export function checkTools({ profile, language }: ToolCheck): void {
  if (profile.shouldInitGit && !hasRepository(profile.dir) && !hasTool('git')) {
    throw new Error(missingTool('git', language))
  }
  if (profile.shouldInstall && !hasTool(profile.pm)) {
    throw new Error(missingTool(profile.pm, language))
  }
}
