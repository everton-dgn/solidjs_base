import { localizedRedirect } from '@evertondgn/solid-runtime/i18n/localized-redirect'
import type { Locale } from '@paraglide/runtime.js'

type RedirectLocaleOptions = {
  locale: Locale
  source: 'action' | 'query'
}

export async function redirectLocale({
  locale,
  source
}: RedirectLocaleOptions): Promise<Response> {
  'use server'
  await Promise.resolve()
  return localizedRedirect({
    href: `/i18n-redirect?from=${source}#target`,
    locale
  })
}
