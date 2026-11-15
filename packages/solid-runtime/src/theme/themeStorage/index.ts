import { parseCookieHeader, serializeCookie } from '@solidjs/web'

import { isTheme } from '../isTheme/index.ts'
import type { Theme, ThemeConfig } from '../types.ts'

export function readTheme(
  options: ThemeConfig,
  cookieHeader?: string | null
): Theme | null | undefined {
  try {
    if (options.storage === 'local-storage') {
      const stored = localStorage.getItem(options.storageKey)
      return isTheme(stored) ? stored : null
    }
    const cookies = cookieHeader === undefined ? document.cookie : cookieHeader
    const value = parseCookieHeader(cookies)[options.cookieName]
    return isTheme(value) ? value : null
  } catch {
    return undefined
  }
}

export function saveTheme(options: ThemeConfig, theme: Theme): boolean {
  try {
    if (options.storage === 'local-storage') {
      localStorage.setItem(options.storageKey, theme)
      return localStorage.getItem(options.storageKey) === theme
    }
    // oxlint-disable-next-line unicorn/no-document-cookie -- Solid serializes the cookie; synchronous reads detect blocked writes.
    document.cookie = serializeCookie(options.cookieName, theme, {
      path: '/',
      maxAge: options.cookieMaxAge,
      sameSite: 'lax',
      secure: location.protocol === 'https:'
    })
    return parseCookieHeader(document.cookie)[options.cookieName] === theme
  } catch {
    return false
  }
}
