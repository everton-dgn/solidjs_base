import type { SeoRouteInfo } from '@evertondgn/solid-runtime/seo/types'
import { m } from '@paraglide/messages.js'

export const seo = {
  title: m.notFound_title,
  description: m.notFound_description,
  noindex: true
} satisfies SeoRouteInfo
