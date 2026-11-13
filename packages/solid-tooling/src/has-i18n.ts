import { existsSync } from 'node:fs'
import path from 'node:path'

export const I18N_SETTINGS = 'project.inlang/settings.json'

export function hasI18n(root: string): boolean {
  // oxlint-disable-next-line node/no-sync -- Vite and Vitest build these configs synchronously.
  return existsSync(path.join(root, I18N_SETTINGS))
}
