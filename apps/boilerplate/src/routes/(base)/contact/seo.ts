import type { SeoRouteInfo } from '@evertondgn/solid-runtime/seo/types'
import { m } from '@paraglide/messages.js'

export const seo = {
  get title() {
    return m.contact_title()
  },
  get description() {
    return m.contact_description()
  }
} satisfies SeoRouteInfo
