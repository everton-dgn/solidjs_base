import * as v from 'valibot'
import { loadEnv, type Plugin } from 'vite-plus'

const LineSchema = v.pipe(v.string(), v.nonEmpty(), v.regex(/^[^\r\n]+$/u))
const GroupSchema = v.strictObject({
  userAgents: v.array(LineSchema),
  allow: v.optional(v.array(LineSchema)),
  disallow: v.optional(v.array(LineSchema))
})
const RobotsSchema = v.strictObject({
  groups: v.optional(v.array(GroupSchema), []),
  sitemapPaths: v.optional(v.array(LineSchema), []),
  cacheControl: v.optional(LineSchema)
})
const RobotsOptionSchema = v.union([v.literal(false), RobotsSchema])
const SeoSchema = v.strictObject({
  originEnv: v.optional(LineSchema, 'VITE_SITE_URL'),
  robots: v.optional(RobotsOptionSchema)
})

type ModuleOptions = { root: string; mode: string; seo?: SeoOptions | false }
type OriginOptions = { root: string; mode: string; key: string }
type SeoPlugin = {
  name: string
  configResolved: () => void
  resolveId: (id: string) => string | undefined
  load: (id: string) => string | null
}

function readOrigin({ root, mode, key }: OriginOptions): string {
  const value = loadEnv(mode, root, key)[key]
  if (!value) throw new Error(`Missing site origin: ${key}`)
  let origin: URL
  try {
    origin = new URL(value)
  } catch {
    throw new Error(
      `${key} must be an HTTP(S) origin without a path, query, fragment or credentials`
    )
  }
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  ) {
    throw new Error(
      `${key} must be an HTTP(S) origin without a path, query, fragment or credentials`
    )
  }
  return origin.origin
}

export type SeoOptions = {
  originEnv?: string
  robots?:
    | false
    | {
        groups?: readonly {
          userAgents: readonly string[]
          allow?: readonly string[]
          disallow?: readonly string[]
        }[]
        sitemapPaths?: readonly string[]
        cacheControl?: string
      }
}

export function seoModule({ root, mode, seo }: ModuleOptions): SeoPlugin {
  const config = v.parse(SeoSchema, seo === false ? {} : (seo ?? {}))
  const origin = () => readOrigin({ root, mode, key: config.originEnv })
  return {
    name: 'solid-app:seo',
    configResolved() {
      if (seo !== false && seo !== undefined) origin()
    },
    resolveId: id =>
      ['virtual:solid-app/seo-origin', 'virtual:solid-app/seo-robots'].includes(
        id
      )
        ? `\0${id}`
        : undefined,
    load: id => {
      if (id === '\0virtual:solid-app/seo-origin') {
        return `export const origin = ${JSON.stringify(origin())}`
      }
      if (id !== '\0virtual:solid-app/seo-robots') return null
      if (config.robots === false || config.robots === undefined) {
        throw new Error(
          'The robots route requires defineSolidApp({ seo: { robots: {} } })'
        )
      }
      const { groups, sitemapPaths, cacheControl } = config.robots
      const siteOrigin = origin()
      return `export const robots = ${JSON.stringify({
        groups,
        sitemaps: sitemapPaths.map(path => new URL(path, siteOrigin).href),
        cacheControl
      })}`
    }
  } satisfies Plugin
}
