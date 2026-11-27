import path from 'node:path'

import type { NitroConfig, PrerenderRoute } from 'nitro/types'
import type { Plugin } from 'vite-plus'

import { readOrigin } from '../seo-module.ts'
import type { ServerAppOptions, StaticBuild } from './types.ts'

const HTTP_NOT_FOUND = 404

type StaticOutputInput = {
  options: ServerAppOptions
  locales: string[]
  directory?: string
  mode?: string
}
type DefaultOutput = { hooks?: never; prerender?: never }
type StaticMiddlewareInput = { root: string; middleware?: string }

// The inventory validates sitemap source kinds after Nitro renders it.
function isPublicationRoute(route: string): boolean {
  const pathname = route.replace(/\/$/u, '')
  return [
    '/robots.txt',
    '/sitemap.xml',
    '/llms.txt',
    '/sitemaps/static.json',
    '/sitemaps/array.xml',
    '/sitemaps/pages/:part.xml',
    '/sitemaps/:source/:part.xml'
  ].includes(pathname)
}

function publicationFeature(pathname: string) {
  if (pathname === '/robots.txt') return 'robots'
  if (pathname === '/llms.txt') return 'llms'
  return 'sitemap'
}

async function readStaticRoutes({ options, directory }: StaticOutputInput) {
  const { PageFileSystemRouter, stripRouteGroups } =
    await import('filesystem-routing')
  const { DEFAULT_EXTENSIONS } = await import('filesystem-routing/vite')
  const router = new PageFileSystemRouter({
    dir: path.resolve(options.root, directory ?? 'src/routes'),
    extensions: [...DEFAULT_EXTENSIONS],
    httpMethods: true,
    serverComponents: true
  })
  const paths = new Set(['/'])
  const dynamicPages: string[] = []
  let hasErrorPage = false
  for (const route of await router.getRoutes()) {
    if (
      route.server ||
      ['$POST', '$PUT', '$DELETE', '$PATCH', '$OPTIONS'].some(
        key => key in route
      ) ||
      (('$GET' in route || '$HEAD' in route) &&
        !isPublicationRoute(stripRouteGroups(route.path)))
    ) {
      throw new Error(
        `output: static cannot publish the server operation at ${route.path}`
      )
    }
    const pathname = stripRouteGroups(route.path).replace(/\/$/u, '')
    if (('$GET' in route || '$HEAD' in route) && isPublicationRoute(pathname)) {
      const feature = publicationFeature(pathname)
      if (
        typeof options.seo !== 'object' ||
        typeof options.seo[feature] !== 'object'
      ) {
        throw new TypeError(
          `output: static ${pathname} requires seo.${feature}`
        )
      }
    }
    if (!route.page) continue
    if (/^\/\*[\w-]+\/?$/u.test(stripRouteGroups(route.path))) {
      if (hasErrorPage) {
        throw new Error('output: static requires a single root catch-all')
      }
      hasErrorPage = true
      continue
    }
    if (/[:*]/u.test(route.path)) {
      dynamicPages.push(route.path)
      continue
    }
    paths.add(pathname || '/')
  }
  return { paths, dynamicPages, hasErrorPage }
}

async function createStaticConfig(input: StaticOutputInput) {
  const { options, locales } = input
  const { inspectHtml, writeHashManifest } = await import('./static-html.ts')
  const { paths, dynamicPages, hasErrorPage } = await readStaticRoutes(input)
  const routes = [...paths]
  for (const locale of locales) {
    for (const page of paths) {
      routes.push(`/${locale}${page === '/' ? '' : page}`)
    }
  }
  const errorPages = new Set<string>()
  if (hasErrorPage) {
    for (const url of [
      '/404.html',
      ...locales.map(locale => `/${locale}/404.html`)
    ]) {
      if (routes.includes(url)) {
        throw new Error(`output: static reserves ${url} for the root catch-all`)
      }
      errorPages.add(url)
      routes.push(url)
    }
  }
  const pages = new Set(routes)
  if (
    typeof options.seo === 'object' &&
    typeof options.seo.robots === 'object'
  ) {
    routes.push('/robots.txt')
  }
  const robots =
    typeof options.seo === 'object' ? options.seo.robots : undefined
  return {
    prerender: { routes, crawlLinks: false, failOnError: true },
    hooks: {
      async compiled({ options: { static: isStatic, output } }: StaticBuild) {
        // Nitro compiles its request renderer before writing prerendered files.
        if (!isStatic) return
        let sitemaps: string[] = []
        if (
          typeof options.seo === 'object' &&
          typeof robots === 'object' &&
          robots.sitemapPaths?.length
        ) {
          const origin = readOrigin({
            root: options.root,
            mode: input.mode ?? 'production',
            key: options.seo.originEnv ?? 'VITE_SITE_URL'
          })
          sitemaps = robots.sitemapPaths
            .map(href => new URL(href, origin))
            .filter(url => url.origin === origin)
            .map(url => decodeURIComponent(url.pathname))
        }
        await writeHashManifest({ output, sitemaps })
      },
      'prerender:done'({ failedRoutes, prerenderedRoutes }) {
        // Keep the original Nitro failure when enumeration also fails.
        if (failedRoutes.length === 0 && dynamicPages.length > 0) {
          throw new Error(
            `output: static cannot enumerate pages: ${dynamicPages.join(', ')}`
          )
        }
        if (failedRoutes.length > 0) return
        const published = new Set(prerenderedRoutes.map(route => route.route))
        const files = new Set(prerenderedRoutes.map(route => route.fileName))
        if (typeof robots === 'object' && !files.has('/robots.txt')) {
          throw new Error('output: static robots.txt not published')
        }
        for (const page of pages) {
          if (!published.has(page)) {
            throw new Error(`output: static page not published: ${page}`)
          }
        }
      },
      'prerender:generate'(route: PrerenderRoute) {
        if (errorPages.has(route.route)) {
          if (!route.error) {
            route.error = new Error(
              `output: static expected httpStatus(404) at ${route.route}; content catch-alls require an enumeration contract`
            )
            return
          }
          if (route.error.status === HTTP_NOT_FOUND) delete route.error
          route.fileName = route.route
        }
        if (route.error) return
        if (
          route.route === '/robots.txt' &&
          (!route.contentType?.startsWith('text/plain') ||
            route.fileName !== '/robots.txt')
        ) {
          route.error = new Error(
            'output: static expected plain text at /robots.txt'
          )
          return
        }
        if (
          pages.has(route.route) &&
          !route.contentType?.startsWith('text/html')
        ) {
          route.error = new Error(
            `output: static expected HTML at ${route.route}`
          )
          return
        }
        if (
          route.contentType?.startsWith('text/html') &&
          /nonce/iu.test(route.contents ?? '') &&
          inspectHtml(route.contents ?? '').hasNonce
        ) {
          route.error = new Error(
            `output: static cannot publish a CSP nonce in ${route.route}; disable nonce generation in the build middleware`
          )
        }
      }
    }
  } satisfies NitroConfig
}

export function staticBuildPlugin({
  root,
  middleware
}: StaticMiddlewareInput): Plugin {
  const entry = middleware ? path.resolve(root, middleware) : undefined
  const wrapper = '\0solid-app:static-middleware'

  return {
    name: 'solid-app:static-build',
    enforce: 'pre',
    resolveId(id, importer) {
      // Solid validates the middleware path on disk before importing it. Without
      // app middleware, only intercept its handler's import of the package manifest.
      if (
        !entry &&
        id === path.resolve(root, 'package.json') &&
        (importer === 'virtual:solid-ssr-handler' ||
          importer === 'virtual:solid-ssr-handler-impl')
      ) {
        return wrapper
      }
      if (id === entry && importer !== wrapper) return wrapper
      return null
    },
    load(id) {
      if (id !== wrapper) return null
      return `${entry ? `import middleware from ${JSON.stringify(entry)}` : 'const middleware = []'}
import { pageRoutes } from 'virtual:file-routes'
import { walkStaticRoutes } from '@evertondgn/solid-runtime/routing/walk-static-routes'
import { configureServerErrors } from '@evertondgn/solid-runtime/server/configure-server-errors'
configureServerErrors()
walkStaticRoutes({
  routes: pageRoutes,
  shouldVisitDynamic: true,
  visit: ({ route, path }) => {
    if (route.$$route?.require().route?.info?.markdown === 'dynamic') {
      throw new Error('output: static cannot publish dynamic Markdown at ' + path)
    }
  }
})
export default [async (event, next) => {
  if (!event.request.headers.has('x-nitro-prerender')) return next()
  // Set both destinations before requestNonce fills an unset event nonce.
  event.nonce = { script: false, style: false }
  const response = await next()
  if (!response.headers.get('content-type')?.startsWith('text/html')) return response
  const body = await response.arrayBuffer()
  const state = event.locals.ssrRenderState
  let statusText
  if (!state) statusText = 'missing render state: use createRenderOptions'
  else if (state.hasErrors === true) statusText = 'render failed during SSR'
  else if (state.hasErrors !== false) statusText = 'render error observer unavailable'
  else if (state.hasCompleted !== true) statusText = 'render incomplete: use renderToStream'
  if (statusText) return new Response(null, { status: 500, statusText })
  return new Response(body, response)
}, ...[middleware].flat()]`
    },
    transform(code, id) {
      if (id === 'virtual:solid-server-function-manifest' && code.trim()) {
        throw new Error(
          `output: static cannot publish server functions: ${code.trim()}`
        )
      }
    }
  }
}

export async function staticOutput(
  input: StaticOutputInput
): Promise<Awaited<ReturnType<typeof createStaticConfig>> | DefaultOutput> {
  return input.options.output === 'static' ? createStaticConfig(input) : {}
}
