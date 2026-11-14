import { buildLocaleAlternates } from '@evertondgn/solid-runtime/i18n/build-locale-alternates'

import type { SitemapEntry } from '@/@types/sitemap.ts'

import { SITEMAP_LOC_LIMIT } from '../../constants.ts'

type LocationOptions = { entries: readonly SitemapEntry[]; siteUrl: string }

export function validateLocations({ entries, siteUrl }: LocationOptions): void {
  for (const { path } of entries) {
    for (const { href } of buildLocaleAlternates({ href: path, siteUrl })) {
      if (href.length > SITEMAP_LOC_LIMIT) throw new Error('loc excede limite')
    }
  }
}
