import { buildLocaleAlternates } from '#solid-runtime/i18n/buildLocaleAlternates/index.ts'

import { SITEMAP_LOC_LIMIT } from '../../constants.ts'
import type { SitemapEntry } from '../../source-types.ts'

type LocationOptions = { entries: readonly SitemapEntry[]; siteUrl: string }

export function validateLocations({ entries, siteUrl }: LocationOptions): void {
  for (const { path } of entries) {
    for (const { href } of buildLocaleAlternates({ href: path, siteUrl })) {
      if (href.length > SITEMAP_LOC_LIMIT) {
        throw new Error('Location exceeds limit')
      }
    }
  }
}
