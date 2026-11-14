import { useLocation, useRouteMatches, type RouteInfo } from '@solidjs/router'
import { type HeadTag, useHead } from '@solidjs/web'
import type { Thing } from 'schema-dts'
import { type Accessor, createMemo, createUniqueId } from 'solid-js'

import { buildLocaleAlternates } from '../../i18n/buildLocaleAlternates/index.ts'
import { getLocale, locales } from '../../i18n/locale/index.ts'
import { localeTag } from '../../i18n/localeTag/index.ts'
import { localizeHref } from '../../i18n/urls/index.ts'
import { buildStructuredData } from '../buildStructuredData/index.ts'
import { resolveRouteSeo } from '../resolveRouteSeo/index.ts'
import { serializeJsonLd } from '../serializeJsonLd/index.ts'
import type { RouteSeoOptions } from '../types.ts'

type SchemaNode = Exclude<Thing, string>

type StructuredData = SchemaNode | readonly SchemaNode[]
function isNodeList(
  data: SchemaNode | readonly SchemaNode[]
): data is readonly SchemaNode[] {
  return Array.isArray(data)
}

function withContext(data: StructuredData): object {
  if (isNodeList(data)) {
    return { '@context': 'https://schema.org', '@graph': data }
  }
  const node: object = data
  return { '@context': 'https://schema.org', ...node }
}

const ROBOTS_INDEX = 'index, follow, max-image-preview:large'
const ROBOTS_NOINDEX = 'noindex'
function publishRouteSeo(options: RouteSeoOptions): void {
  const { site: SITE, localeTagOverrides: LOCALE_TAG_OVERRIDES } = options
  const resolveSiteUrl = (pathname: string) => new URL(pathname, SITE.url).href
  const location = useLocation()
  const matches = useRouteMatches()
  const seo = createMemo(() =>
    resolveRouteSeo({
      metadata: matches().map(match => {
        const info: RouteInfo | undefined = match.route.info
        return info?.seo
      }),
      site: SITE
    })
  )
  const canonical = createMemo(() =>
    resolveSiteUrl(localizeHref({ href: location.pathname }))
  )
  const image = createMemo(() => resolveSiteUrl(seo().image.path))
  const markdownHref = createMemo(() =>
    options.markdownHref?.(
      localizeHref({ href: location.pathname }),
      matches().map(match => match.route.info)
    )
  )
  const structuredData = () =>
    buildStructuredData({
      ...options,
      seo: seo(),
      url: canonical(),
      image: image()
    })

  const baseTags = (): HeadTag[] => [
    {
      tag: 'meta',
      props: {
        name: 'robots',
        content: seo().noindex ? ROBOTS_NOINDEX : ROBOTS_INDEX
      }
    },
    { tag: 'title', props: { children: seo().title } },
    { tag: 'meta', props: { name: 'description', content: seo().description } }
  ]

  const articleTags = (): HeadTag[] => {
    if (seo().type !== 'article') return []
    const tags: HeadTag[] = []
    const { datePublished, dateModified } = seo().article ?? {}
    if (datePublished) {
      tags.push({
        tag: 'meta',
        props: { property: 'article:published_time', content: datePublished }
      })
    }
    if (dateModified) {
      tags.push({
        tag: 'meta',
        props: { property: 'article:modified_time', content: dateModified }
      })
    }
    return tags
  }

  const indexableTags = (): HeadTag[] => {
    const markdown = markdownHref()
    return [
      {
        tag: 'meta',
        props: {
          property: 'og:locale',
          content: SITE.locale.replaceAll('-', '_')
        }
      },
      ...locales
        .filter(locale => locale !== getLocale())
        .map(locale => ({
          tag: 'meta' as const,
          key: `og:locale:alternate:${locale}`,
          props: {
            property: 'og:locale:alternate',
            content: localeTag(locale, LOCALE_TAG_OVERRIDES).replaceAll(
              '-',
              '_'
            )
          }
        })),
      { tag: 'meta', props: { property: 'og:site_name', content: SITE.title } },
      {
        tag: 'meta',
        props: { name: 'twitter:card', content: 'summary_large_image' }
      },
      ...(SITE.twitter
        ? [
            {
              tag: 'meta' as const,
              props: { name: 'twitter:site', content: SITE.twitter }
            }
          ]
        : []),
      ...(SITE.author?.twitter
        ? [
            {
              tag: 'meta' as const,
              props: { name: 'twitter:creator', content: SITE.author.twitter }
            }
          ]
        : []),
      { tag: 'meta', props: { property: 'og:type', content: seo().type } },
      { tag: 'meta', props: { property: 'og:title', content: seo().title } },
      {
        tag: 'meta',
        props: { property: 'og:description', content: seo().description }
      },
      { tag: 'meta', props: { name: 'twitter:title', content: seo().title } },
      {
        tag: 'meta',
        props: { name: 'twitter:description', content: seo().description }
      },
      { tag: 'link', props: { rel: 'canonical', href: canonical() } },
      ...(markdown
        ? [
            {
              tag: 'link' as const,
              key: 'markdown-alternate',
              props: {
                rel: 'alternate',
                type: 'text/markdown',
                href: resolveSiteUrl(markdown)
              }
            }
          ]
        : []),
      ...buildLocaleAlternates({
        href: location.pathname,
        siteUrl: SITE.url
      }).map(({ hreflang, href }) => ({
        tag: 'link' as const,
        props: { rel: 'alternate', hreflang, href }
      })),
      { tag: 'meta', props: { property: 'og:url', content: canonical() } },
      { tag: 'meta', props: { property: 'og:image', content: image() } },
      {
        tag: 'meta',
        props: {
          property: 'og:image:width',
          content: String(seo().image.width)
        }
      },
      {
        tag: 'meta',
        props: {
          property: 'og:image:height',
          content: String(seo().image.height)
        }
      },
      {
        tag: 'meta',
        props: { property: 'og:image:alt', content: seo().image.alt }
      },
      { tag: 'meta', props: { name: 'twitter:image', content: image() } },
      {
        tag: 'meta',
        props: { name: 'twitter:image:alt', content: seo().image.alt }
      },
      ...articleTags(),
      {
        tag: 'script',
        key: 'structured-data',
        props: { type: 'application/ld+json', children: structuredData() }
      }
    ]
  }

  useHead(() =>
    seo().noindex ? baseTags() : [...baseTags(), ...indexableTags()]
  )
}

export type CreateSeoOptions =
  | ({ route: true; structuredData?: never } & RouteSeoOptions)
  | { route?: never; structuredData: Accessor<StructuredData | undefined> }

export function createSeo(options: CreateSeoOptions): void {
  if (options.route) {
    publishRouteSeo(options)
    return
  }

  const id = createUniqueId()

  useHead(() => {
    const nodes = options.structuredData()
    if (nodes === undefined) return []

    return {
      tag: 'script',
      key: `structured-data:${id}`,
      props: {
        type: 'application/ld+json',
        children: serializeJsonLd(withContext(nodes))
      }
    }
  })
}
