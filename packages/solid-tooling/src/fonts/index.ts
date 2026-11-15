import type { HtmlTagDescriptor, ModuleNode, Plugin } from 'vite-plus'

import { readFontAssets } from './assets.ts'
import type { FontAssets, FontOptions } from './types.ts'

const MODULE_ID = 'virtual:solid-app/fonts'
const RESOLVED_ID = '\0solid-app:fonts'

export function fontsPlugin(options: FontOptions): Plugin | undefined {
  if (options.fonts === undefined) return undefined
  if (!Array.isArray(options.fonts)) {
    throw new TypeError(
      'defineSolidApp fonts: fonts must be an array of family descriptors.'
    )
  }
  if (options.fonts.length === 0) return undefined
  let assets: Promise<FontAssets>
  let base = '/'
  let assetsDir = 'assets'
  let isBuild = false
  const read = () => readFontAssets({ ...options, base, assetsDir })

  return {
    name: 'solid-app:fonts',
    async configResolved(config) {
      ;({ base } = config)
      ;({ assetsDir } = config.build)
      isBuild = config.command === 'build'
      assets = read()
      await assets
    },
    async buildStart() {
      const result = await assets
      for (const file of result.files) this.addWatchFile(file)
      if (isBuild && this.environment.name === 'client') {
        for (const asset of result.assets) {
          this.emitFile({
            type: 'asset',
            fileName: asset.fileName,
            source: asset.source
          })
        }
      }
    },
    resolveId: id => (id === MODULE_ID ? RESOLVED_ID : undefined),
    async load(id): Promise<string | undefined> {
      if (id !== RESOLVED_ID) return undefined
      const { stylesheet, preloads } = await assets
      return `export const stylesheet = ${JSON.stringify(stylesheet)}; export const preloads = ${JSON.stringify(preloads)}`
    },
    async transformIndexHtml(): Promise<HtmlTagDescriptor[] | undefined> {
      if (options.ssr !== false) return undefined
      const { stylesheet, preloads } = await assets
      const tags: HtmlTagDescriptor[] = [
        { tag: 'link', attrs: { rel: 'stylesheet', href: stylesheet } },
        ...preloads.map(({ href, type }) => ({
          tag: 'link',
          attrs: {
            rel: 'preload',
            href,
            as: 'font',
            type,
            crossorigin: 'anonymous'
          }
        }))
      ]
      return tags
    },
    configureServer(server) {
      // Serve external CSS even in development; importing CSS through JS would
      // make Vite inject a style element instead of preserving this contract.
      // oxlint-disable-next-line eslint/max-params -- Connect invokes middleware with request, response and next.
      server.middlewares.use((request, response, next) => {
        void (async () => {
          try {
            const result = await assets
            const asset = result.assets.find(
              item => request.url?.split('?')[0] === `${base}${item.fileName}`
            )
            if (!asset) {
              next()
              return
            }
            response.setHeader('Content-Type', asset.type)
            response.setHeader('Cache-Control', 'no-cache')
            response.end(asset.source)
          } catch (error) {
            // oxlint-disable-next-line node/callback-return -- The async middleware ends immediately after forwarding the error.
            next(error)
          }
        })()
      })
    },
    async handleHotUpdate({ file, server }): Promise<ModuleNode[] | undefined> {
      const result = await assets
      if (!result.files.includes(file)) return undefined
      assets = read()
      await assets
      for (const environment of Object.values(server.environments)) {
        const module = environment.moduleGraph.getModuleById(RESOLVED_ID)
        if (module) environment.moduleGraph.invalidateModule(module)
      }
      server.ws.send({ type: 'full-reload' })
      return []
    }
  }
}
