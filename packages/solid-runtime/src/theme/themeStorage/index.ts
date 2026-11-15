import { parseCookieHeader, serializeCookie } from '@solidjs/web'

import { isTheme } from '../isTheme/index.ts'
import type { Theme, ThemeOptions } from '../types.ts'

export function readTheme(
  options: ThemeOptions,
  cookieHeader?: string | null
): Theme | null | undefined {
  try {
    const cookies = cookieHeader === undefined ? document.cookie : cookieHeader
    const value = parseCookieHeader(cookies)[options.cookieName]
    return isTheme(value) ? value : null
  } catch {
    return undefined
  }
}

export function saveTheme(options: ThemeOptions, theme: Theme): boolean {
  try {
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
