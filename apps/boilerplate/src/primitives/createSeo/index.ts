import {
  createSeo as createRuntimeSeo,
  type CreateSeoOptions
} from '@evertondgn/solid-runtime/seo/create-seo'
import {
  hasMarkdownOptIn,
  markdownPath
} from '@evertondgn/solid-runtime/seo/markdown-route'
import type { RouteInfo } from '@solidjs/router'

import { SITE } from '@/constants/site/index.ts'
import { LOCALE_TAG_OVERRIDES } from '@/i18n/localeTagOverrides/index.ts'

type Options =
  | Omit<
      Extract<CreateSeoOptions, { route: true }>,
      'site' | 'localeTagOverrides' | 'markdownHref'
    >
  | Extract<CreateSeoOptions, { route?: never }>

export function createSeo(options: Options): void {
  if (options.route) {
    createRuntimeSeo({
      ...options,
      site: SITE,
      localeTagOverrides: LOCALE_TAG_OVERRIDES,
      markdownHref: (
        pathname: string,
        info: readonly (RouteInfo | undefined)[]
      ) => (hasMarkdownOptIn(info) ? markdownPath(pathname) : undefined)
    })
    return
  }
  createRuntimeSeo(options)
}
