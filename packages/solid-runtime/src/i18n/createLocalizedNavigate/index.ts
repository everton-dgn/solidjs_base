import {
  useLocation,
  useNavigate,
  type NavigateOptions,
  type TypedPath
} from '@solidjs/router'
import { isServer } from '@solidjs/web'

import { getLocale } from '../locale/index.ts'
import { isAbsoluteHref, resolveLocalizedHref } from '../urls/index.ts'

type LocalizedNavigateOptions = Omit<Partial<NavigateOptions>, 'resolve'> & {
  href: string | TypedPath
  locale?: string
  shouldLocalize?: boolean
}

// Document navigation cannot carry router state or scroll options.
export function createLocalizedNavigate() {
  const navigate = useNavigate()
  const location = useLocation()

  return ({
    href,
    locale,
    shouldLocalize,
    ...options
  }: LocalizedNavigateOptions): void => {
    const requestedHref = String(href)
    // With resolve: false, fragments need the current path and query.
    const resolvedHref =
      requestedHref === '' || requestedHref.startsWith('#')
        ? `${location.pathname}${location.search}${requestedHref}`
        : requestedHref
    const target = resolveLocalizedHref({
      href: shouldLocalize === false ? requestedHref : resolvedHref,
      locale,
      shouldLocalize,
      base: `${location.pathname}${location.search}${location.hash}`
    })
    const shouldUseDocumentNavigation =
      shouldLocalize === false ||
      (locale !== undefined && locale !== getLocale()) ||
      isAbsoluteHref(target)
    if (shouldUseDocumentNavigation && !isServer) {
      if (options.replace) globalThis.location.replace(target)
      else globalThis.location.assign(target)
      return
    }
    navigate(target, { ...options, resolve: false })
  }
}
