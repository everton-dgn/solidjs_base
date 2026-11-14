# 0034. Runtime Markdown and compiled publication

- Status: Accepted
- Date: 2026-11-14

## Context

Markdown conversion, editorial index assembly and artifact validation belonged
to the boilerplate copy. Derived applications had to copy that implementation
and manually share a build identity through `extend`. The publication controller
and sitemap already belonged to the runtime (ADR 0033).

## Decision

Move request Markdown and llms services into the runtime, and prerender,
validation, Vercel routes and generation-bound manifests into compiled tooling.
The application owns editorial data, route wrappers, its security binding and
one publication controller shared by sitemap and Markdown. All build options are
serializable data, following ADR 0019. Remove the legacy `publication` flag and
reject it with an explicit migration error.

```ts
// All publication features, with the application's existing runtime bindings.
seo: {
  sitemap: { static: true },
  markdown: { static: true },
  llms: {},
  llmsFull: {}
}

// Only Markdown, static and negotiated responses.
seo: { markdown: { static: true } }

// Only request-time Markdown, without static artifacts.
seo: { markdown: {} }

// Only the editorial index, whose page links point to HTML.
seo: { llms: {} }

// No SEO publication. Remove route bindings and Document announcements too.
seo: false
```

Robots and `originEnv` remain independent SEO fields. `sitemap: true` preserves
static header rules for direct services; `{ static: true }` also enables the
artifact pipeline. `llmsFull` requires enabled llms and static Markdown and
fails early for an incompatible combination. Each enabled factory is explicitly
bound by the application; importing a disabled factory fails instead of adding
hidden routes. No feature is implicitly enabled by another feature.

The same configuration works without `project.inlang/settings.json`. Set
`language: 'en'` if desired, bind the same factories and keep unprefixed routes.
The server locale context executes directly, static listing uses
`extractLocaleFromUrl(url) ?? baseLocale`, and static headers use `/**.md`. The
Vercel home HTML rule precedes the Markdown index. I18n applications retain
their generated provider and locale-prefixed patterns.

`createMarkdownContent({ publication, router, siteUrl, applySecurityHeaders, notFoundMessage? })`
fills the middleware `document` slot. It preserves negotiation, GET/HEAD,
noindex, security, cancellation and the render-integrity gate. Normal HTML keeps
streaming. A missing, incomplete or failed integrity state refuses Markdown; no
local `renderToStream.onError` is installed.

`createLlms({ site, router, notes?, pages?, fullPage?, cacheControl? })`
supplies the GET handler. Notes, section names, use cases and full-document
announcement stay in the application. Enabled full publication requires
`fullPage` metadata. The build validates the editorial index before selecting
aggregate documents.

## Budgets and scale

The Markdown defaults are 2 MiB of input, 2 MiB of output and 15 seconds per
request, configured by `maxInputBytes`, `maxOutputBytes` and `timeoutMs`. The
controller retains process admission and output reservations; applications must
adjust its total reserve when increasing per-document budgets. HTML and
converted strings coexist during synchronous conversion. Cancellation cannot
preempt that synchronous work, and byte limits do not bound all allocations.

`llms.maxBytes` defaults to 1 MiB; `llmsFull.maxBytes` defaults to 10 MiB.
Over-budget indexes or aggregates fail without truncation. Budgets are positive
safe integers; timeouts also fit the platform timer range. The aggregate writes
documents sequentially to a temporary file and promotes only validated output.
Its selection and metadata still scale with the complete editorial index.

Route collection, static listing, inventories, artifact path/hash maps and llms
assembly scale with the complete route set. Output bounds apply after some of
those allocations. Conversion is bounded per document; the complete build still
renders every selected locale/page. These limits are operational starting
values, not an unlimited-capacity claim. Source quotas remain per process and
caches are not persistent or shared between instances.

## Converter dependency

The runtime depends on published `@mdream/js` through `catalog:` and does not
vendor it or require converter injection. The monorepo root applies the copy's
optional patch, so its existing conversion regressions continue to exercise the
patched dependency resolved by the runtime. Installed tarballs use the published
package. Across the 67 conversion fixtures, the patch passes all cases while
published `@mdream/js@2.1.0` differs in 29. Differences include word separators
inside nested inline wrappers, whitespace around links and emphasis, accessible
names after filtering link content, and link titles entering visible text. For
example, `<p>a<span> <span>b</span></span></p>` becomes `ab` in the published
converter and `a b` with the patch, without any icons. The installed HTTP matrix
asserts the published `ab` result explicitly. Removing an icon can also leave a
leading space inside emphasis or an empty link despite an accessible label. See
the [copy's Markdown guide](../../apps/boilerplate/docs/seo/markdown.md) for
patch installation and removal criteria.

## Consequences and validation

The installed matrix runs publication in both linkers and serves real Markdown,
llms and the aggregate with and without i18n. Four additional isolated profiles
cover Markdown only, llms only, all publication disabled and dynamic Markdown.
The matrix has fourteen installation cases plus version alignment. Negative
mutations inject a one-byte llms budget, a disabled-resource Link or a used llms
module. All existing scenario assertions remain required.

The application keeps composed middleware and editorial integration tests and
browser/production E2E, including `project/seo-module` and the I18n production
gate. Pure Markdown/llms tests and the 67 converter patch regressions live in
runtime; build tests live in tooling. Static Markdown's internal listing carries
the SSR build identity, which tooling validates even without static sitemap.
Artifact and HTTP oracles compare the complete public set against the baseline.
These checks do not establish live CDN behavior or capacity under load.
