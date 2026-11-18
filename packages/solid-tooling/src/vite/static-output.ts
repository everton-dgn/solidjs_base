import path from 'node:path'

import type { NitroConfig } from 'nitro/types'
import type { Plugin } from 'vite-plus'

import type { ServerAppOptions } from './types.ts'

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

export function staticBuildPlugin(root: string, middleware?: string): Plugin {
  const entry = middleware ? path.resolve(root, middleware) : undefined
  const wrapper = '\0solid-app:static-middleware'

  return {
    name: 'solid-app:static-build',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id === entry && importer !== wrapper) return wrapper
      return null
    },
    load(id) {
      if (id !== wrapper) return null
      return `import middleware from ${JSON.stringify(entry)}
import { configureServerErrors } from '@evertondgn/solid-runtime/server/configure-server-errors'
configureServerErrors()
export default [(event, next) => { event.nonce = { script: false, style: false }; return next() }, ...[middleware].flat()]`
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

export async function staticOutput({
  options,
  locales,
  directory
}: {
  options: ServerAppOptions
  locales: string[]
  directory?: string
}): Promise<NitroConfig> {
  if (options.output !== 'static') return {}
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
    if (route.page) {
      if (/[:*]/u.test(route.path)) {
        dynamicPages.push(route.path)
        continue
      }
      paths.add(stripRouteGroups(route.path).replace(/\/$/u, '') || '/')
    }
  }
  const routes = [...paths]
  for (const locale of locales) {
    for (const page of paths) {
      routes.push(`/${locale}${page === '/' ? '' : page}`)
    }
  }
  const pages = new Set(routes)
  if (
    typeof options.seo === 'object' &&
    typeof options.seo.robots === 'object'
  ) {
    routes.push('/robots.txt')
  }
  return {
    prerender: { routes, crawlLinks: false, failOnError: true },
    hooks: {
      'prerender:done'({ failedRoutes }) {
        if (failedRoutes.length === 0 && dynamicPages.length > 0) {
          throw new Error(
            `output: static cannot enumerate pages: ${dynamicPages.join(', ')}`
          )
        }
      },
      'prerender:generate'(route) {
        if (route.error) return
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
          /<[^>]+\snonce\s*=/iu.test(route.contents ?? '')
        ) {
          route.error = new Error(
            `output: static cannot publish a CSP nonce in ${route.route}; disable nonce generation in the build middleware`
          )
        }
      }
    }
  }
}
