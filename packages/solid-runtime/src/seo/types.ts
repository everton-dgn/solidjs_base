import type { RouteInfo } from '@solidjs/router'
import type { ContactPoint, PostalAddress } from 'schema-dts'

import type { SeoRouterMetadata } from '../@types/router.d.ts'

type SeoPageType = 'website' | 'article'

export type SeoImage = {
  path: string
  width: number
  height: number
  alt: string
}
export type SeoArticle = {
  datePublished?: string
  dateModified?: string
}

export type SeoMetadata = {
  title: string
  description: string
  noindex: boolean
  type: SeoPageType
  image: SeoImage
  article?: SeoArticle
}

export type SeoRouteInfo = Partial<Omit<SeoMetadata, 'image'>> & {
  image?: Partial<SeoImage>
}

export type SeoSite = {
  title: string
  description: string
  url: string
  locale: string
  image: SeoImage
  logo?: string
  twitter?: string
  author?: { name: string; url?: string; twitter?: string; sameAs?: string[] }
  socialLinks?: string[]
  organization?: {
    contactPoint?: Extract<ContactPoint, { '@type': 'ContactPoint' }>
    address?: Extract<PostalAddress, { '@type': 'PostalAddress' }>
  }
}

export type RouteSeoOptions = {
  site: SeoSite
  localeTagOverrides?: Readonly<Record<string, string>>
  markdownHref?: (
    pathname: string,
    info: readonly ((RouteInfo & SeoRouterMetadata) | undefined)[]
  ) => string | undefined
}

export type RobotsGroup = {
  userAgents: readonly string[]
  allow?: readonly string[]
  disallow?: readonly string[]
}

export type RobotsOptions = {
  groups: readonly RobotsGroup[]
  sitemaps?: readonly string[]
  cacheControl?: string
}
