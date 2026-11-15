import type { SeoRouteInfo } from '@evertondgn/solid-runtime/seo/types'
import { m } from '@paraglide/messages.js'

export const seo = {
  get title() {
    return m.home_seoTitle()
  }
} satisfies SeoRouteInfo
