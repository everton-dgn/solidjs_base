export const LOCALE_SOURCE = `
export const locales = ['fr', 'de', 'ja']
export const baseLocale = 'de'
export const getLocale = () => 'fr'
export const setLocale = () => undefined
export function extractLocaleFromUrl(url) {
  const segment = new URL(url).pathname.split('/')[1]
  return locales.includes(segment) ? segment : undefined
}
export function deLocalizeUrl(input) {
  const url = new URL(typeof input === 'string' ? input : input.href)
  if (extractLocaleFromUrl(url)) url.pathname = '/' + url.pathname.split('/').slice(2).join('/')
  return url
}
export function localizeHref(href, options) {
  const url = deLocalizeUrl(new URL(href, 'https://example.com'))
  const pathname = url.pathname === '/' ? '' : url.pathname
  return '/' + (options?.locale ?? getLocale()) + pathname + url.search + url.hash
}
`
