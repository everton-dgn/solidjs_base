import { createLlms } from '@evertondgn/solid-runtime/seo/llms'

import { SITE_CACHE_CONTROL } from '@/constants/cache.ts'
import { SITE } from '@/constants/site/index.ts'
import { Router } from '@/router.ts'

import { LLMS_FULL_PAGE, LLMS_NOTES, LLMS_USE_CASES } from './constants.ts'

export const GET = createLlms({
  site: SITE,
  router: Router,
  notes: LLMS_NOTES,
  pages: LLMS_USE_CASES,
  cacheControl: SITE_CACHE_CONTROL,
  fullPage: LLMS_FULL_PAGE
})
