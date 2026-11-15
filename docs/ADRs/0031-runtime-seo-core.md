# 0031. SEO metadata, structured data and robots belong to the runtime

- Status: Accepted
- Date: 2026-11-14

## Context

The boilerplate owns reusable route metadata merging, head tags, JSON-LD and
robots responses. The extraction prototype proved explicit factory options and
data-only virtual modules with equivalent HTTP responses. Moving publication,
sitemap, llms or Markdown at the same time would expand the contract beyond that
boundary.

## Decision

The runtime exposes `seo/create-seo`, `seo/resolve-route-seo`, `seo/types`,
`seo/origin`, `seo/create-robots` and `seo/robots-route`. `createSeo` receives
an explicit site and uses the locale seam. Author, organization, logo and social
fields are optional, with no package-owned editorial defaults. Type-only router
augmentation accompanies the feature. `schema-dts` becomes a runtime dependency
using the workspace catalog; direct application type imports keep their own
dependency.

`resolveRouteSeo` is public because llms and other index consumers need the same
parent-to-child inheritance without loading the head publisher. The application
keeps a thin adapter injecting SITE, locale tags and a Markdown alternate
callback. It keeps all publishing infrastructure and content indexes.

The tooling's optional SSR `seo` option accepts serializable robots data and an
origin key, defaulting to `VITE_SITE_URL`. Unknown keys and executable config
values are rejected. The two virtual modules contain serialized data only.
Origin validation runs when SEO is enabled or the origin entry is imported:
HTTP(S), no path, query, fragment or credentials. A meta-only application can
omit that option and supply its own site URL. The existing `serverEnv` entry is
a schema fragment for server keys, not an environment reader, so it is not used
to read the SEO origin.

The common robots route binds the injectable factory and prepends the existing
wildcard rules. Its common route re-exports GET in one line; the router provides
HEAD. Sitemap lines require explicit paths, and development/production caching
retains the prior contract. JSON-LD escapes `<`, U+2028 and U+2029 before
useHead in both route graphs and custom data. Runtime hostile-string tests and
application security E2E cover this boundary; removing the escape must fail a
regression test.

No SEO-specific lint exception existed on the moved application paths. The
existing interface exception remains restricted to declaration files, including
the runtime router declaration. `project/seo-module` stays in tooling.

## Consequences

The application changes its type imports and origin/config ownership while
retaining its HTTP behavior. Its `feat` migration carries a breaking-change
footer because consumers must adopt those contracts. Generic tests move with the
implementation; composed publication and E2E tests stay in the application.

The installed matrix adds SEO to SSR plain and one isolated meta-only profile.
Client-only rejects planted SEO imports, and the regular suite checks invalid
origins both enabled and unused. Runtime dependencies join the pin-alignment
check. The matrix has nine installation cases and one alignment test; it does
not prove production CDN behavior. Application module-path configuration and the
remaining publication extraction are deferred until separately proven.
