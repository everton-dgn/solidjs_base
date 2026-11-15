import 'server-only'
import type { APIEvent } from 'filesystem-routing/api'

import { HTTP_NOT_FOUND } from '#solid-runtime/http/constants.ts'
import { validatePublicationTimeout } from '#solid-runtime/infra/server/publication/helpers/validatePublicationTimeout/index.ts'
import { readPublicationPhase } from '#solid-runtime/infra/server/readPublicationPhase/index.ts'

import type { SitemapContext } from '../../types.ts'
import { createSitemapContext } from '../readSitemapContext/index.ts'
import { errorResponse } from '../sitemapService/helpers/sitemapResponse/index.ts'
import {
  buildSitemapIndexResponse,
  buildSitemapInventoryResponse,
  buildSitemapPartResponse
} from '../sitemapService/index.ts'
import type {
  ServiceOptions,
  SitemapSettings
} from '../sitemapService/types.ts'

type BoundOptions = SitemapRouteOptions & { readContext: () => SitemapContext }
type SitemapRoutes = {
  index: SitemapRoute
  pages: SitemapRoute
  source: SitemapRoute
  array: SitemapRoute
  inventory: InventoryRoute
}
type SitemapRoute = (event: APIEvent) => Promise<Response>
type InventoryRoute = () => Promise<Response>
type SettingsOptions = { options: BoundOptions; request: Request }
type XmlSegments = { part: string; source: string }

const XML_SUFFIX = '.xml'
const SOURCE_SEGMENT_FROM_END = -2

function serviceOptions({ options, request }: SettingsOptions): ServiceOptions {
  return {
    ...options,
    ...options.readContext(),
    signal: request.signal,
    method: request.method
  }
}

// The router matches /sitemaps/pages/1 and 1.xml with the same pattern.
// Reject missing suffixes before reading sitemap state.
function readXmlSegments(request: Request): XmlSegments | undefined {
  const segments = new URL(request.url).pathname.split('/')
  const segment = segments.at(-1) ?? ''
  if (!segment.endsWith(XML_SUFFIX)) return undefined
  return {
    part: segment.slice(0, -XML_SUFFIX.length),
    source: segments.at(SOURCE_SEGMENT_FROM_END) ?? ''
  }
}

function notFound(): Promise<Response> {
  return Promise.resolve(errorResponse(HTTP_NOT_FOUND))
}

function createIndexRoute(options: BoundOptions): SitemapRoute {
  return ({ request }) =>
    buildSitemapIndexResponse(serviceOptions({ options, request }))
}

function createPagePartRoute(options: BoundOptions): SitemapRoute {
  return ({ request }) => {
    const segments = readXmlSegments(request)
    if (!segments) return notFound()
    return buildSitemapPartResponse({
      ...serviceOptions({ options, request }),
      kind: 'pages',
      part: segments.part
    })
  }
}

function createSourcePartRoute(options: BoundOptions): SitemapRoute {
  return ({ request }) => {
    const segments = readXmlSegments(request)
    if (!segments) return notFound()
    return buildSitemapPartResponse({
      ...serviceOptions({ options, request }),
      kind: 'source',
      ...segments
    })
  }
}

function createArrayPartRoute(options: BoundOptions): SitemapRoute {
  return ({ request }) =>
    buildSitemapPartResponse({
      ...serviceOptions({ options, request }),
      kind: 'array',
      part: 'array'
    })
}

// Only prerender may rebuild the inventory.
function createInventoryRoute(options: BoundOptions): InventoryRoute {
  return () => {
    if (readPublicationPhase() !== 'prerender') return notFound()
    return buildSitemapInventoryResponse({
      ...options,
      ...options.readContext()
    })
  }
}

export type SitemapRouteOptions = Omit<SitemapSettings, 'signal' | 'method'> & {
  usesArtifacts?: boolean
}

export function createSitemapRoutes(
  options: SitemapRouteOptions
): SitemapRoutes {
  if (options.timeoutMs !== undefined) {
    validatePublicationTimeout(options.timeoutMs)
  }
  const bound = {
    ...options,
    readContext: createSitemapContext(options.usesArtifacts ?? false)
  }
  return {
    index: createIndexRoute(bound),
    pages: createPagePartRoute(bound),
    source: createSourcePartRoute(bound),
    array: createArrayPartRoute(bound),
    inventory: createInventoryRoute(bound)
  }
}
