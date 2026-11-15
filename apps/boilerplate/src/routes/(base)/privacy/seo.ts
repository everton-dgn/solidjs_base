import type { SeoRouteInfo } from '@evertondgn/solid-runtime/seo/types'
import { m } from '@paraglide/messages.js'

export const seo = {
  get title() {
    return m.privacy_title()
  },
  get description() {
    return m.privacy_description()
  }
} satisfies SeoRouteInfo
