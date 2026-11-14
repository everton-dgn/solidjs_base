import type { ServerAppOptions } from './types.ts'

type StaticPathsInput = {
  options: Pick<ServerAppOptions, 'publicAssets' | 'staticPaths' | 'seo'>
  locales: string[]
}
type LocalePathInput = { staticPath: string; locales: string[] }

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
  const seo = typeof options.seo === 'object' ? options.seo : {}
  const hasMarkdown =
    typeof seo.markdown === 'object' && seo.markdown.static === true
  const markdownPaths =
    locales.length > 0 ? locales.map(locale => `/${locale}/**.md`) : ['/**.md']
  const publishedPaths = [
    ...(hasMarkdown ? markdownPaths : []),
    ...(typeof seo.llms === 'object' ? ['/llms.txt'] : []),
    ...(typeof seo.llmsFull === 'object' ? ['/llms-full.txt'] : []),
    ...(seo.sitemap !== undefined && seo.sitemap !== false
      ? ['/sitemap.xml', '/sitemaps/pages/**']
      : []),
    ...(hasMarkdown ? ['/_markdown/static.json'] : [])
  ]
  return ['/assets/**', ...appPaths, ...publishedPaths]
}
