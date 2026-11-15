import type { RobotsOptions } from '../types.ts'
import { buildRobotsText } from './buildRobotsText/index.ts'

export function createRobots(options: RobotsOptions): () => Response {
  let cached: string | undefined
  return () => {
    const body =
      cached ??
      buildRobotsText({
        groups: options.groups,
        sitemaps: options.sitemaps ?? []
      })
    if (import.meta.env.PROD) cached = body
    return new Response(body, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control':
          options.cacheControl ??
          (import.meta.env.PROD
            ? 'public, max-age=0, s-maxage=3600, stale-if-error=86400'
            : 'no-store')
      }
    })
  }
}
