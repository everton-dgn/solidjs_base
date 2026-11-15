import type { SeoRouteInfo } from '@evertondgn/solid-runtime/seo/types'
import { m } from '@paraglide/messages.js'

export const seo = {
  get title() {
    return m.notFound_title()
  },
  get description() {
    return m.notFound_description()
  },
  noindex: true
} satisfies SeoRouteInfo
