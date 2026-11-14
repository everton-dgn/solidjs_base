import { createMarkdownContent } from '@evertondgn/solid-runtime/seo/markdown'
import { m } from '@paraglide/messages.js'

import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'
import { publication } from '@/infra/server/publication/index.ts'
import { Router } from '@/router.ts'

import { applySecurityHeaders } from '../securityHeaders/index.ts'

export const markdownContent = createMarkdownContent({
  publication,
  router: Router,
  siteUrl: resolveSiteUrl('/'),
  applySecurityHeaders,
  notFoundMessage: () => m.notFound_description()
})
