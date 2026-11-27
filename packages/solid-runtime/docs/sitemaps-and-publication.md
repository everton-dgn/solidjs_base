# Sitemap and publication

[Runtime reference](README.md)

| Entry                           | API                                                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `./server/publication`          | `createPublicationController(limits?)`                                                                                             |
| `./server/publication-types`    | `PublicationController`, `PublicationLimits`, `PublicationMetrics`, `PublicationOptions`, `PublicationContext` and `SourceOptions` |
| `./seo/sitemap-routes`          | `createSitemapRoutes`, which returns the `index`, `pages`, `source` and `array` handlers                                           |
| `./seo/sitemap-types`           | `SitemapEntry`, `SitemapPartitionSource`, `SitemapRouteInfo`, `SitemapMetadata` and the `RouteInfo.sitemap` augmentation           |
| `./server/publication-protocol` | Shared publication constants, as plain JavaScript with handwritten declarations                                                    |
| `./server/publication-phase`    | `readPublicationPhase()`: `direct`, `prerender` or `artifact`                                                                      |
| `./routing/walk-static-routes`  | `walkStaticRoutes`, which visits the static routes of the router                                                                   |
| `./routing/types`               | `StaticRoute`, `WalkStaticRoutesOptions` and `WalkFrame`                                                                           |

`./seo/sitemap-routes` also exports `SitemapRouteOptions`, the settings of
`createSitemapRoutes`, including `usesArtifacts`.
`./server/publication-protocol` exports `PUBLICATION_PHASE_ENV`,
`PUBLICATION_PRERENDER_PHASE`, `PUBLICATION_ARTIFACT_DIR`,
`SITEMAP_MANIFEST_FILE`, `SITEMAP_IDENTITIES_FILE`, `SITEMAP_ARTIFACT_VERSION`,
`SITEMAP_MANIFEST_MAX_BYTES`, `SITEMAP_IDENTITIES_MAX_BYTES`,
`MARKDOWN_PRERENDER_PATH`, `MAX_HTML_BYTES`, `MAX_MARKDOWN_BYTES`,
`MARKDOWN_TIMEOUT_MS`, `LLMS_PATH`, `LLMS_FULL_PATH`, `LLMS_DESCRIBEDBY_LINK`,
`LLMS_MAX_BYTES` and `LLMS_FULL_MAX_BYTES`.

`@evertondgn/solid-runtime/server/publication` exports
`createPublicationController(limits?)`. Create one instance per application in a
server-only module and inject it into sitemap and Markdown. Creating a separate
instance for each handler doubles the intended local quotas. `getMetrics()`
returns a snapshot; the application decides where to expose observability.

```ts
// src/infra/server/publication/index.ts
import 'server-only'
import { createPublicationController } from '@evertondgn/solid-runtime/server/publication'

export const publication = createPublicationController()
export const { runPublication, getMetrics: getPublicationMetrics } = publication
```

Bind explicit application sources to the factory. Take the sources of
[Sitemaps with bounded work](../README.md#sitemaps-with-bounded-work) and pass
this shared controller instead of a new one. Their in-memory catalog is only an
example: replace the read inside the server-only source with an adapter that
honors the requested limit and signal.

```ts
// src/infra/server/sitemap/index.ts, with the sources of the example above
import { publication } from '../publication/index.ts'

export const { index, pages, source, array } = createSitemapRoutes({
  sources, publication, siteUrl: origin
})
```

Re-export these handlers as `GET` in `/sitemap.xml`,
`/sitemaps/pages/[part].xml`, `/sitemaps/[source]/[part].xml` and
`/sitemaps/array.xml`, respectively. The page route `/articles/[id]` must exist
and be indexable. `HEAD` preserves status and headers with no body. A missing
`.xml` suffix or missing part returns an empty 404 with `no-store`.

A small dynamic route may instead declare an array source. Importing its type
includes the `RouteInfo.sitemap` augmentation without importing a server module.
Its route metadata must cross a server function before reaching private data:

```ts
// src/routes/catalog/[id]/listCatalog.ts
import type { SitemapEntry } from '@evertondgn/solid-runtime/seo/sitemap-types'

export async function listCatalog(signal: AbortSignal): Promise<SitemapEntry[]> {
  'use server'
  signal.throwIfAborted()
  return await Promise.resolve([{ path: '/catalog/42', lastmod: '2026-10-02' }])
}
```

The page declares `export const route = { info: { sitemap: listCatalog } }`. Do
not register an array and partitioned source for the same route. Array sources
return complete lists; for larger data sets use partitions whose query itself
applies `limit`. Validation after allocation cannot bound a bad query.

Both examples work without `project.inlang`: one unprefixed URL per entry, no
language alternates, no Paraglide dependency. With the existing i18n setup, the
same API emits every configured locale and `x-default` for the base locale. Keep
each locale group together within one part.

In `defineSolidApp`,
`seo: { sitemap: true, robots: { sitemapPaths: ['/sitemap.xml'] } }` enables the
static sitemap header rules and advertises the root. Routes are explicit
application files. To disable sitemap, remove those routes, their server binding
and array metadata; omit `seo.sitemap` and the robots `sitemapPaths`. Robots can
remain installed. No sitemap service is imported by the ordinary SEO or robots
entries.

| Option                                                      | Default and constraint                                                                         |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `createPublicationController({ total, sitemap, markdown })` | 4 total, 2 per kind; positive safe integers                                                    |
| `sources`, `perSource`                                      | 4 concurrent source reads, 2 per source object                                                 |
| `outputs`, `reservedBytes`                                  | 4 live outputs, 16,777,216 reserved bytes                                                      |
| `createSitemapRoutes({ timeoutMs })`                        | 10,000 ms for the full dynamic operation; integer from 1 to 2,147,483,647                      |
| `byteBudget`                                                | 4,194,304 bytes; at most 52,428,800 uncompressed XML bytes                                     |
| `cacheControl`                                              | Production: `public, max-age=0, s-maxage=3600, stale-if-error=86400`; development: `no-store`  |
| `usesArtifacts`                                             | `false`; set `true` with `seo.sitemap: { static: true }` and the compiled artifact integration |

The route factory and `runPublication` reject timeouts outside that range with
`RangeError` before scheduling work. This prevents a timer overflow from turning
a large configured deadline into a 1 ms timeout. Direct page parts use the same
admission and output reservations as the other dynamic sitemap responses;
production artifacts remain served by the file layer.

A sitemap has at most 50,000 localized URLs, a location has at most 2,048
characters, and an index has at most 50,000 parts. These protocol bounds are not
application tunables. `listPartitions` receives the remaining index capacity
plus one; `readPartition` receives `floor(50000 / locales.length) + 1` to detect
overflow. Both receive the publication `AbortSignal`. Oversized sources fail
with empty 503 `no-store`, never partial successful XML. Overload also carries
`Retry-After: 1`. No internal queue or retry is added.

Route collection, matching and the partition registry scale with the complete
route/source set and are cached per factory in production. Direct mode retains
that route inventory in memory. The index enumerates partition IDs within its
count/byte budget and reads complete array sources on each request. A part reads
only its selected source and bounded batch; XML construction still holds that
batch and its string/encoded body. The controller reserves output bytes, not
every allocation made by the application or database driver. Each process has
independent quotas. A source ignoring cancellation occupies its slot until
settlement; recycle a stuck instance using the host's procedure after fixing the
adapter. Process caches are neither persistent storage nor global quotas.

The boilerplate app's artifact path persists static XML and generation-bound
manifests. Its reader loads identities only for array-source collision checks
and refuses missing, oversized or mismatched artifacts without rebuilding on a
request. `inventory` is a fifth handler restricted to prerender, used by that
build integration. The compiled tooling owns publication artifacts and Markdown
prerender. It shares the plain-JavaScript `server/publication-protocol` entry
with the server reader, so the build and the server agree on every path, file
name and byte budget; a regression test ties the handwritten literal
declarations to the values.

Two more entries help an application write its own publisher.
`readPublicationPhase()` from `server/publication-phase` tells server code
whether it runs in development (`direct`), in the build's prerender worker
(`prerender`) or in the production server, next to the built artifacts
(`artifact`). The build sets that phase in the worker environment, so a request
header cannot fake it. `walkStaticRoutes` from `routing/walk-static-routes` is
the route walk behind the sitemap, `llms.txt` and the static Markdown list, so a
publisher built on it sees the same pages they do.
