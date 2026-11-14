export const SITE_CACHE_CONTROL = import.meta.env.PROD
  ? 'public, max-age=0, s-maxage=3600, stale-if-error=86400'
  : 'no-store'
