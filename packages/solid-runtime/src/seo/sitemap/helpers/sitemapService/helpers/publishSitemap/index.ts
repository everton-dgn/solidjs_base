import { HTTP_INTERNAL_SERVER_ERROR } from '#solid-runtime/http/constants.ts'
import type {
  PublicationContext,
  SourceOptions
} from '#solid-runtime/infra/server/publication/types.ts'
import { SITEMAP_SOURCES_TIMEOUT_MS } from '#solid-runtime/seo/sitemap/constants.ts'

import type { ServiceOptions } from '../../types.ts'
import { errorResponse } from '../sitemapResponse/index.ts'

type PublishOptions = {
  options: ServiceOptions
  byteBudget: number
  run: (context: PublicationContext) => Promise<Response>
}

// Keep the slot until run settles. Abort source signals after the read,
// including sources with pending work after returning a response.
export async function publishSitemap({
  options,
  byteBudget,
  run
}: PublishOptions): Promise<Response> {
  const { signal, method = 'GET' } = options
  const response = await options.publication.runPublication({
    kind: 'sitemap',
    signal,
    method,
    timeoutMs: options.timeoutMs ?? SITEMAP_SOURCES_TIMEOUT_MS,
    maxOutputBytes: byteBudget,
    run: async context => {
      const finished = new AbortController()
      // Use a function declaration: route scanners may parse this source as TSX.
      function readSource<T>({ key, run: read }: SourceOptions<T>): Promise<T> {
        return context.readSource({
          key,
          run: sourceSignal =>
            read(AbortSignal.any([sourceSignal, finished.signal]))
        })
      }
      try {
        return await run({ signal: context.signal, readSource })
      } finally {
        finished.abort()
      }
    }
  })
  return response.status === HTTP_INTERNAL_SERVER_ERROR
    ? errorResponse()
    : response
}
