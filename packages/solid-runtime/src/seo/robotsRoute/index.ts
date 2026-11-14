import { robots } from 'virtual:solid-app/seo-robots'
import { endpoint } from 'virtual:solid-server-function-handler'

import { createRobots } from '../createRobots/index.ts'

export const GET = createRobots({
  groups: [
    { userAgents: ['*'], allow: ['/'], disallow: [endpoint] },
    ...robots.groups
  ],
  sitemaps: robots.sitemaps,
  cacheControl: robots.cacheControl
})
