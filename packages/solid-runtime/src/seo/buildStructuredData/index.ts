import type { Article, Graph, Organization, WebPage, WebSite } from 'schema-dts'

import { locales } from '../../i18n/locale/index.ts'
import { localeTag } from '../../i18n/localeTag/index.ts'
import { serializeJsonLd } from '../serializeJsonLd/index.ts'
import type { SeoMetadata, RouteSeoOptions } from '../types.ts'

type BuildStructuredDataOptions = RouteSeoOptions & {
  seo: SeoMetadata
  url: string
  image: string
}

type SiteNode = Extract<WebSite, { '@type': 'WebSite' }>
type PageNode = Extract<WebPage | Article, { '@type': 'WebPage' | 'Article' }>
type OrganizationNode = Extract<Organization, { '@type': 'Organization' }>
type StructuredDataGraph = Omit<Graph, '@graph'> & {
  '@graph': readonly [SiteNode, PageNode, ...OrganizationNode[]]
}

export function buildStructuredData({
  site: SITE,
  localeTagOverrides: LOCALE_TAG_OVERRIDES,
  seo,
  url,
  image
}: BuildStructuredDataOptions): string {
  const resolveSiteUrl = (pathname: string) => new URL(pathname, SITE.url).href
  const siteId = resolveSiteUrl('/#website')
  const organizationId = resolveSiteUrl('/#organization')
  const pageBase = {
    '@id': url,
    url,
    name: seo.title,
    description: seo.description,
    inLanguage: SITE.locale,
    isPartOf: { '@id': siteId },
    image: { '@type': 'ImageObject', url: image, caption: seo.image.alt }
  } satisfies Omit<PageNode, '@type'>
  const page: PageNode =
    seo.type === 'article'
      ? {
          '@type': 'Article',
          ...pageBase,
          headline: seo.title,
          ...(SITE.author && {
            author: {
              '@type': 'Person',
              name: SITE.author.name,
              url: SITE.author.url,
              sameAs: SITE.author.sameAs
            }
          }),
          ...(SITE.organization && { publisher: { '@id': organizationId } }),
          ...seo.article
        }
      : { '@type': 'WebPage', ...pageBase }
  const graph: StructuredDataGraph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': siteId,
        url: resolveSiteUrl('/'),
        name: SITE.title,
        description: SITE.description,
        inLanguage: locales.map(locale =>
          localeTag(locale, LOCALE_TAG_OVERRIDES)
        ),
        ...(SITE.organization && { publisher: { '@id': organizationId } })
      },
      page,
      ...(SITE.organization
        ? [
            {
              '@type': 'Organization' as const,
              '@id': organizationId,
              name: SITE.title,
              description: SITE.description,
              contactPoint: SITE.organization.contactPoint,
              address: SITE.organization.address,
              url: resolveSiteUrl('/'),
              ...(SITE.logo && {
                logo: {
                  '@type': 'ImageObject' as const,
                  url: resolveSiteUrl(SITE.logo)
                }
              }),
              sameAs: SITE.socialLinks
            }
          ]
        : [])
    ]
  }
  return serializeJsonLd(graph)
}
