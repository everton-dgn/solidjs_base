# Markdown and editorial indexes

[Runtime reference](README.md)

| Entry                                 | API                                                                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `./seo/markdown`                      | `createMarkdownContent`, the middleware `document` step                                                                       |
| `./seo/markdown-types`                | Types of the Markdown route metadata                                                                                          |
| `./seo/markdown-route`                | `hasMarkdownOptIn`, `isMarkdownRoute` and `markdownPath`, pure path and metadata helpers                                      |
| `./seo/convert-html`                  | `convertHtml({ response, url, signal, maxBytes? })`, which reads an HTML response within its byte budget and returns Markdown |
| `./seo/collect-static-markdown-pages` | `collectStaticMarkdownPages(routes)`, the localized paths of opted-in static pages; parameterized routes stay dynamic         |
| `./seo/llms`                          | `createLlms`, the GET handler of `llms.txt`                                                                                   |
| `./seo/llms-types`                    | Types of the llms route metadata and pages                                                                                    |
| `./i18n/locale-context`               | Server-only locale context for publication, with or without a translation project                                             |

Bind `createMarkdownContent` from `seo/markdown` to the middleware `document`
slot with
`{ publication, router, siteUrl, applySecurityHeaders, notFoundMessage? }`. Use
the same controller as sitemap, described in
[Sitemap and publication](sitemaps-and-publication.md). Bind `createLlms` from
`seo/llms` to the llms GET route with
`{ site, router, notes?, pages?, fullPage?, cacheControl? }`. The boilerplate
app's wrappers show the complete binding; editorial data stays in the app. Route
metadata types come from `seo/markdown-types`, which exports `MarkdownMatch`,
`MarkdownRouter` and `MarkdownOptions`, and `seo/llms-types`, which exports
`LlmsSelection`, `LlmsPage` and `LlmsOptions`. `seo/markdown-route` supplies
pure path and metadata helpers. A route opts in with `info: { markdown: true }`,
or `'dynamic'` for request-time conversion only.

Enable generation with
`seo: { markdown: { static: true }, llms: {}, llmsFull: {} }` in
`defineSolidApp`. Omitted or false features stay disabled. Dynamic Markdown uses
`markdown: {}`; llms alone links to HTML. Remove disabled route bindings and
document discovery links. The runtime refuses an imported disabled service. The
server-only `i18n/locale-context` runs with the generated locale context or
directly for a single-language application. It does not relax `locale-request`.

Defaults are 2 MiB HTML, 2 MiB Markdown and 15 seconds, with the shared
controller's admission limits. llms and its aggregate default to 1 MiB and 10
MiB. Full publication requires llms and static Markdown. These are bounded
documents, while route inventories and editorial selection grow with the entire
site.
[ADR 0034](https://github.com/everton-dgn/solidjs_base/blob/main/docs/ADRs/0034-runtime-markdown-publication.md)
records all options, no-i18n behavior, scaling costs and the optional mdream
patch. Published tarballs use published mdream; the boilerplate app's root patch
is not shipped in this package.
