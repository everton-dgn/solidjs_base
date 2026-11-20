import { accessSync, constants, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { message, type Language } from './cli-language.ts'

const links = {
  git: 'https://git-scm.com/downloads',
  bun: 'https://bun.sh',
  pnpm: 'https://pnpm.io/installation',
  npm: 'https://nodejs.org/download'
}
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
    values: { tool, link: links[tool] }
  })
}
