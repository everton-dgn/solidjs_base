import type {
  SeoArticle,
  SeoImage,
  SeoMetadata,
  SeoRouteInfo,
  SeoSite,
  SeoText
} from '../types.ts'

type ResolveOptions = {
  metadata: readonly (SeoRouteInfo | undefined)[]
  site: SeoSite
}

type ResolveImageOptions = {
  base: SeoImage
  image: SeoRouteInfo['image']
}

type ResolveArticleOptions = {
  base: SeoArticle | undefined
  article: SeoArticle | undefined
}

function readText(text: SeoText | undefined): string | undefined {
  return typeof text === 'function' ? text() : text
}

function resolveImage({ base, image }: ResolveImageOptions): SeoImage {
  return {
    path: image?.path ?? base.path,
    width: image?.width ?? base.width,
    height: image?.height ?? base.height,
    alt: readText(image?.alt) ?? base.alt
  }
}

function resolveArticle({
  base,
  article
}: ResolveArticleOptions): SeoArticle | undefined {
  if (!article) return base
  const resolved: SeoArticle = { ...base }
  if (article.datePublished !== undefined) {
    resolved.datePublished = article.datePublished
  }
  if (article.dateModified !== undefined) {
    resolved.dateModified = article.dateModified
  }
  return resolved
}

export function resolveRouteSeo({
  metadata,
  site: SITE
}: ResolveOptions): SeoMetadata {
  const resolved: SeoMetadata = {
    title: SITE.title,
    description: SITE.description,
    noindex: false,
    type: 'website',
    image: { ...SITE.image }
  }
  for (const seo of metadata) {
    resolved.title = readText(seo?.title) ?? resolved.title
    resolved.description = readText(seo?.description) ?? resolved.description
    resolved.noindex = seo?.noindex ?? resolved.noindex
    resolved.type = seo?.type ?? resolved.type
    resolved.image = resolveImage({ base: resolved.image, image: seo?.image })
    const article = resolveArticle({
      base: resolved.article,
      article: seo?.article
    })
    if (article) resolved.article = article
  }
  return resolved
}
