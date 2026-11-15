import { THEME_COOKIE_NAME } from './config.ts'

export function clearThemeCookie(): void {
  // oxlint-disable-next-line unicorn/no-document-cookie -- Tests remove the cookie directly to isolate preferences.
  document.cookie = `${THEME_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
}
