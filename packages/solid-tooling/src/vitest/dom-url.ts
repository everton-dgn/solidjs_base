import { readFileSync } from 'node:fs'
import path from 'node:path'

import { hasI18n, I18N_SETTINGS } from '../has-i18n.ts'

const ORIGIN = 'http://localhost'

function readBaseLocale(root: string): string {
  let settings: unknown
  try {
    settings = JSON.parse(
      // oxlint-disable-next-line node/no-sync -- Vite and Vitest build these configs synchronously.
      readFileSync(path.join(root, I18N_SETTINGS), 'utf8')
    )
  } catch (error) {
    throw new Error(
      `solidTest: cannot read the base locale from ${I18N_SETTINGS}; fix the file or pass domUrl.`,
      { cause: error }
    )
  }
  const baseLocale =
    settings !== null &&
    typeof settings === 'object' &&
    'baseLocale' in settings
      ? settings.baseLocale
      : undefined
  if (typeof baseLocale !== 'string' || baseLocale === '') {
    throw new Error(
      `solidTest: ${I18N_SETTINGS} must declare baseLocale as a string; fix the file or pass domUrl.`
    )
  }
  return baseLocale
}

// The dom project starts on a page the application serves: the root without
// Paraglide, and the base locale with it. That assumes urlPatterns that prefix
// every locale; an application that serves a locale without a prefix passes
// domUrl.
export function defaultDomUrl(root: string): string {
  return hasI18n(root) ? `${ORIGIN}/${readBaseLocale(root)}` : `${ORIGIN}/`
}
