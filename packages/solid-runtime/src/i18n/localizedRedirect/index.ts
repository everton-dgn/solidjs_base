import { getRequestEvent, HREF, isServer, redirect } from '@solidjs/web'

import type { LocalizedRedirectOptions } from '../../@types/solid.d.ts'
import { resolveLocalizedHref } from '../urls/index.ts'

export function localizedRedirect({
  href,
  locale,
  shouldLocalize,
  ...init
}: LocalizedRedirectOptions): Response {
  const logicalHref = typeof href === 'string' ? href : href[HREF]
  let target = typeof logicalHref === 'string' ? logicalHref : String(href)
  if (shouldLocalize !== false && !/^(?:\/|[a-z][a-z\d+.-]*:)/iu.test(target)) {
    const base = isServer
      ? getRequestEvent()?.locals.localizedPageBase
      : globalThis.location.href
    if (!base) {
      throw new Error(
        'localizedRedirect requires a safe page base for relative hrefs. Use a root-relative href or shouldLocalize: false for endpoints/assets.'
      )
    }
    const url = new URL(target, base)
    target = `${url.pathname}${url.search}${url.hash}`
  }
  return redirect(
    resolveLocalizedHref({
      href: target,
      locale,
      shouldLocalize
    }),
    init
  )
}
