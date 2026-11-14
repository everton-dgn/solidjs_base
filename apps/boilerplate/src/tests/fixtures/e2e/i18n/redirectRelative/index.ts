import { localizedRedirect } from '@evertondgn/solid-runtime/i18n/localized-redirect'

type RelativeRedirectKind = 'query' | 'parent' | 'fragment' | 'empty'

export async function redirectRelative(
  kind: RelativeRedirectKind
): Promise<Response> {
  'use server'
  await Promise.resolve()
  const hrefs = {
    query: '?saved=1',
    parent: '../next',
    fragment: '#target',
    empty: ''
  }
  return localizedRedirect({ href: hrefs[kind] })
}
