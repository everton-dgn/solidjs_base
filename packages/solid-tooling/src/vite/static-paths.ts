import type { ServerAppOptions } from './types.ts'

type StaticPathsInput = {
  options: Pick<
    ServerAppOptions,
    'publicAssets' | 'staticPaths' | 'publication' | 'seo'
  >
  locales: string[]
}
type LocalePathInput = { staticPath: string; locales: string[] }

const SEO_FILE_PATHS = [
  '/llms.txt',
  '/llms-full.txt',
  '/sitemap.xml',
  '/sitemaps/pages/**',
  '/_markdown/static.json'
]

function isUnderLocale({ staticPath, locales }: LocalePathInput): boolean {
  const [firstSegment] = staticPath.split('/').slice(1)
  return locales.includes(firstSegment ?? '')
}

// Nitro compiles the routeRules with the preMerge of h3, which refuses a partial
// overlap: a path inside a locale folder would cross its /<locale>/**.md rule,
// and the compilation would fall back to the simple mode with a warning. The
// published .md files sit under the locale prefix of the Paraglide urlPatterns.
export function staticFilePaths({
  options,
  locales
}: StaticPathsInput): string[] {
  const appPaths = [
    ...(options.publicAssets ?? []).map(asset => `${asset.baseURL}/**`),
    ...(options.staticPaths ?? [])
  ]
  const collision = appPaths.find(staticPath =>
    isUnderLocale({ staticPath, locales })
  )
  if (collision) {
    throw new Error(
      `defineSolidApp: the static path ${collision} is inside a locale folder; move it out of /${collision.split('/')[1]}/.`
    )
  }
  const hasSitemap = options.seo !== false && options.seo?.sitemap === true
  const publishedPaths = options.publication
    ? [
        ...locales.map(locale => `/${locale}/**.md`),
        ...SEO_FILE_PATHS.filter(
          staticPath => !staticPath.startsWith('/sitemap') || hasSitemap
        )
      ]
    : []
  const sitemapPaths =
    !options.publication && hasSitemap
      ? SEO_FILE_PATHS.filter(staticPath => staticPath.startsWith('/sitemap'))
      : []
  return ['/assets/**', ...appPaths, ...publishedPaths, ...sitemapPaths]
}
