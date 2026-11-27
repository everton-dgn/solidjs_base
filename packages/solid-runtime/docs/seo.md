# Optional SEO

[Runtime reference](README.md)

SEO entries use the `solid` condition and have no shared server barrel:

| Entry                     | API                                                                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./seo/create-seo`        | `createSeo({ route: true, site, localeTagOverrides?, markdownHref? })` or `createSeo({ structuredData })`                                             |
| `./seo/resolve-route-seo` | `resolveRouteSeo({ metadata, site })` merges parent-to-child metadata                                                                                 |
| `./seo/types`             | `SeoSite`, `SeoRouteInfo`, `SeoMetadata`, `SeoImage`, `SeoArticle`, `RouteSeoOptions`, `RobotsGroup`, `RobotsOptions` and the router SEO augmentation |
| `./seo/origin`            | `origin`, the normalized configured HTTP(S) origin                                                                                                    |
| `./seo/create-robots`     | `createRobots({ groups, sitemaps?, cacheControl? })` returns a GET handler                                                                            |
| `./seo/robots-route`      | `GET`, bound to the preset's robots data                                                                                                              |

`./seo/create-seo` also exports `CreateSeoOptions`, the type of the options for
route metadata or for structured data alone.

In an SSR application, enable the optional preset configuration and define
`VITE_SITE_URL=https://example.com` in its environment:

```ts
export default defineSolidApp({
  root: import.meta.dirname,
  securityHeaders: SECURITY_HEADERS,
  seo: { robots: { groups: [{ userAgents: ['ExampleBot'], disallow: ['/private'] }] } }
})
```

The robots route is one line:

```ts
export { GET } from '@evertondgn/solid-runtime/seo/robots-route'
```

The preset route prepends the wildcard group allowing `/` and disallowing the
Solid server-function endpoint. The route supports GET and router-provided HEAD
with the same headers. It caches text in production with
`public, max-age=0, s-maxage=3600, stale-if-error=86400`; development defaults
to `no-store`. Set `cacheControl` to replace that policy. The preset's
`sitemapPaths` resolves explicit paths against the origin; with no paths there
are no `Sitemap:` lines. The separate sitemap factory below generates sitemap
responses.

Pass editorial values explicitly, then call the primitive once in the Router's
root owner:

```ts
import { getLocale } from '@evertondgn/solid-runtime/i18n/locale'
import { createSeo } from '@evertondgn/solid-runtime/seo/create-seo'
import { origin } from '@evertondgn/solid-runtime/seo/origin'
import type { SeoSite } from '@evertondgn/solid-runtime/seo/types'

const site = {
  title: 'Example',
  description: 'Example application',
  url: origin,
  get locale(): string { return getLocale() },
  image: { path: '/cover.png', width: 1200, height: 630, alt: 'Example cover' }
} satisfies SeoSite

function registerRouteSeo(): void {
  createSeo({ route: true, site })
}
```

Without i18n, the locale seam uses `language` (default `en`) and keeps paths
unprefixed. With an Inlang project the same API reads its generated provider;
use message getters for translated editorial values and `localeTagOverrides` for
regional tags. No runtime SEO module imports Paraglide directly.

For meta and JSON-LD only, omit the preset's `seo` option and the robots route,
replace the `origin` import with an explicit `site.url`, and keep the same
`createSeo` call. No environment origin is required. A structured-data-only call
does not need a site or a Router:

```ts
createSeo({ structuredData: () => ({ '@type': 'Thing', name: 'Example' }) })
```

Client-only applications can omit all SEO imports and the `seo` option. The
installed matrix checks that no SEO module enters that profile. The preset
rejects `seo` together with `ssr: false`, as it does other SSR options.

The origin entry and enabled preset option require an HTTP(S) origin with no
path, query, fragment or credentials. `originEnv` selects another environment
key. Omitting SEO or setting it to `false` leaves unused origin values alone;
importing the origin entry still validates it. The virtual modules contain only
serialized origin and robots data, never application module paths or imports.

Site title, description, URL, locale and image are required. Author,
organization, logo and social fields are optional. Omitted organization removes
the Organization node and publisher references; omitted author removes Person
and its social tag. There are no example identities in runtime defaults.
`resolveRouteSeo` is public so index consumers can share inheritance rules
without importing the head publisher. Page types and augmentation travel through
type-only imports.

Both route graphs and custom data escape `<`, U+2028 and U+2029 before reaching
`useHead`. This preserves JSON values while preventing script delimiters from
appearing literally. `noindex` routes publish only robots, title and
description; explicit structured-data calls remain independent. `markdownHref`
only supplies an optional alternate URL; Markdown rendering and publication stay
in the app. `schema-dts` is a type dependency supplied by the runtime; declare
it directly when application code imports its types.
