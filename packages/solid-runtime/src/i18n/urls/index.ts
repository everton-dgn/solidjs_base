import {
  deLocalizeUrl,
  getLocale,
  localizeHref as localizeRuntimeHref
} from '../locale/index.ts'

type LocalizeHrefOptions = { href: string; locale?: string }

type ResolveLocalizedHrefOptions = LocalizeHrefOptions & {
  base?: string
  shouldLocalize?: boolean
}

const LOCAL_ORIGIN = 'https://local.invalid'

export function isAbsoluteHref(href: string): boolean {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(href)) return true
  // URL parsing discards tabs and treats backslashes as slashes, allowing a different host.
  return (
    href.startsWith('/') && new URL(href, LOCAL_ORIGIN).origin !== LOCAL_ORIGIN
  )
}

export function localizeHref({ href, locale }: LocalizeHrefOptions): string {
  if (!href.startsWith('/') || isAbsoluteHref(href)) return href
  return localizeRuntimeHref(href, { locale })
}

export function delocalizePathname(pathname: string): string {
  return deLocalizeUrl(new URL(pathname, LOCAL_ORIGIN)).pathname
}

export function resolveLocalizedHref({
  href,
  locale,
  base,
  shouldLocalize = true
}: ResolveLocalizedHrefOptions): string {
  if (!shouldLocalize || isAbsoluteHref(href)) return href
  const currentLocale = getLocale()
  if (
    (href === '' || href.startsWith('#')) &&
    (!locale || locale === currentLocale)
  ) {
    return href
  }
  let resolved = href
  if (!href.startsWith('/')) {
    if (!base) {
      throw new Error(
        'Localized navigation requires a Router or base for relative page URLs. Use a root-relative href or shouldLocalize: false for endpoints/assets.'
      )
    }
    const url = new URL(href, new URL(base, LOCAL_ORIGIN))
    resolved = `${url.pathname}${url.search}${url.hash}`
  }
  return localizeHref({ href: resolved, locale: locale ?? currentLocale })
}
