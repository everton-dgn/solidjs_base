# Entry points and requirements

[Runtime reference](README.md)

## Requirements

- The application runs on a Node version inside the range of `engines.node` in
  the [package manifest](../package.json), whose floor is the lowest version the
  package is tested with.
- The Solid Vite plugin adds the `solid` condition to the application build for
  the TypeScript entries.
- The node project of `solidTest`, from `@evertondgn/solid-tooling/vitest`,
  resolves the package through the same condition, and the `tsconfig.app.json`
  of the tooling package sets it for TypeScript.
- `@solidjs/web` is a peer dependency, pinned to the version the package is
  tested with. `filesystem-routing` is a package dependency: the routing helpers
  resolve from the runtime package. The `StartMiddleware` type copies the one of
  `@solidjs/vite-plugin`, so the plugin, and Vite with it, stays out of the
  production install. Applications retain a direct routing dependency only when
  their own source imports it.
- The published source reads the `nonce` and `renderMode` fields that the Solid
  plugin adds to `RequestEvent`. Your application type-checks them with no
  declaration of its own: they come from `@evertondgn/solid-tooling/app-env`,
  which the `tsconfig.app.json` of the tooling package loads. An application
  with its own TypeScript config keeps `@evertondgn/solid-tooling/app-env` in
  `types`.

Each module has its own entry point, so an application bundles only the modules
it imports. TypeScript entries use the `solid` condition. The env fragment, the
header constants, the stored theme script and the publication protocol use
`types` and `default` for plain Node compatibility.

## Entry points

The package has 64 entry points in 8 groups and no barrel: `seo` 15,
`middleware` 12, `server` 12, `theme` 11, `i18n` 10, `routing` 2, `env` 1 and
`fonts` 1, the keys of `exports` in the [package manifest](../package.json). A
single-language app needs no translation project, and a theme or SEO module
enters the bundle only when your code imports it.

The table lists every entry by feature, with the virtual modules in its import
graph. That column comes from a static read of the source at commit `4d2c326`,
following relative imports and the package's `#solid-runtime/*` alias and
skipping type-only imports. No entry was run without the preset. Of the 64
entries, 34 import no virtual module, 3 import only the virtual modules of the
routing and Solid plugins, and 27 import `virtual:solid-app/*` modules, which
only `defineSolidApp` serves. The TypeScript entries also need the `solid`
export condition, and an entry that imports no virtual module can still take an
argument built by one that does.

| Entry point                                                                     | `virtual:solid-app/*` modules                                    | Plugin modules           |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------ |
| [`./middleware/create-middleware`](middleware.md#building-the-chain)            | `locale`, `request-middleware`                                   | routes, server functions |
| [`./middleware/security-headers`](middleware.md#security-headers)               | None                                                             | None                     |
| [`./middleware/security-headers/constants`](middleware.md#security-headers)     | None                                                             | None                     |
| [`./middleware/contain-failures`](middleware.md#building-the-chain)             | `locale`                                                         | routes, server functions |
| [`./middleware/api-routes`](middleware.md)                                      | None                                                             | routes                   |
| [`./middleware/restrict-page-methods`](middleware.md)                           | None                                                             | routes, server functions |
| [`./middleware/request-classification`](middleware.md)                          | None                                                             | routes, server functions |
| [`./middleware/negotiate-page-format`](middleware.md)                           | None                                                             | None                     |
| [`./middleware/is-html-response`](middleware.md)                                | None                                                             | None                     |
| [`./middleware/types`](middleware.md)                                           | None                                                             | None                     |
| [`./middleware/append-vary`](i18n.md)                                           | None                                                             | None                     |
| [`./middleware/localize-request`](i18n.md#locale-request-middleware)            | `locale-request`                                                 | routes, server functions |
| [`./server/configure-server-errors`](server-errors.md)                          | `locale`                                                         | None                     |
| [`./server/public-errors`](server-errors.md)                                    | `locale`                                                         | None                     |
| [`./server/protect-server-operation`](server-errors.md)                         | `locale`                                                         | None                     |
| [`./server/log-server-failure`](server-errors.md)                               | None                                                             | None                     |
| [`./server/is-control-response`](server-errors.md)                              | None                                                             | None                     |
| [`./server/render-integrity`](server-errors.md)                                 | None                                                             | None                     |
| [`./server/publication-scope`](server-errors.md)                                | `locale`                                                         | None                     |
| [`./server/create-render-options`](server-errors.md#authored-render-entries)    | None                                                             | None                     |
| [`./server/publication`](sitemaps-and-publication.md)                           | `locale`                                                         | None                     |
| [`./server/publication-types`](sitemaps-and-publication.md)                     | None                                                             | None                     |
| [`./server/publication-protocol`](sitemaps-and-publication.md)                  | None                                                             | None                     |
| [`./server/publication-phase`](sitemaps-and-publication.md)                     | None                                                             | None                     |
| [`./i18n/locale`](i18n.md)                                                      | `locale`                                                         | None                     |
| [`./i18n/urls`](i18n.md)                                                        | `locale`                                                         | None                     |
| [`./i18n/build-locale-alternates`](i18n.md)                                     | `locale`                                                         | None                     |
| [`./i18n/create-localized-navigate`](i18n.md#navigation-and-language-tags)      | `locale`                                                         | None                     |
| [`./i18n/create-locale-navigation-guard`](i18n.md#navigation-and-language-tags) | `locale`                                                         | None                     |
| [`./i18n/install-locale-history-guard`](i18n.md#navigation-and-language-tags)   | `locale`                                                         | None                     |
| [`./i18n/locale-tag`](i18n.md#navigation-and-language-tags)                     | `locale`                                                         | None                     |
| [`./i18n/prepare-client-locale`](i18n.md#navigation-and-language-tags)          | `locale`                                                         | None                     |
| [`./i18n/localized-redirect`](i18n.md#locale-request-middleware)                | `locale`                                                         | None                     |
| [`./i18n/locale-context`](markdown.md)                                          | `locale-context`                                                 | None                     |
| [`./theme/define-theme`](theme.md)                                              | None                                                             | None                     |
| [`./theme/create-theme`](theme.md)                                              | None                                                             | None                     |
| [`./theme/create-theme/types`](theme.md)                                        | None                                                             | None                     |
| [`./theme/types`](theme.md)                                                     | None                                                             | None                     |
| [`./theme/is-theme`](theme.md)                                                  | None                                                             | None                     |
| [`./theme/apply-theme`](theme.md)                                               | None                                                             | None                     |
| [`./theme/stored-theme-script`](theme.md)                                       | None                                                             | None                     |
| [`./theme/theme-storage`](theme.md)                                             | None                                                             | None                     |
| [`./theme/make-system-theme`](theme.md)                                         | None                                                             | None                     |
| [`./theme/make-theme-channel`](theme.md)                                        | None                                                             | None                     |
| [`./theme/make-broadcast-channel`](theme.md)                                    | None                                                             | None                     |
| [`./seo/create-seo`](seo.md)                                                    | `locale`                                                         | None                     |
| [`./seo/resolve-route-seo`](seo.md)                                             | None                                                             | None                     |
| [`./seo/types`](seo.md)                                                         | None                                                             | None                     |
| [`./seo/origin`](seo.md)                                                        | `seo-origin`                                                     | None                     |
| [`./seo/create-robots`](seo.md)                                                 | None                                                             | None                     |
| [`./seo/robots-route`](seo.md)                                                  | `seo-robots`                                                     | server functions         |
| [`./seo/markdown`](markdown.md)                                                 | `locale`, `locale-context`, `request-middleware`, `seo-markdown` | routes, server functions |
| [`./seo/markdown-types`](markdown.md)                                           | None                                                             | None                     |
| [`./seo/markdown-route`](markdown.md)                                           | `locale`                                                         | None                     |
| [`./seo/convert-html`](markdown.md)                                             | None                                                             | None                     |
| [`./seo/collect-static-markdown-pages`](markdown.md)                            | `locale`                                                         | None                     |
| [`./seo/llms`](markdown.md)                                                     | `locale`, `locale-context`, `seo-llms`                           | routes                   |
| [`./seo/llms-types`](markdown.md)                                               | None                                                             | None                     |
| [`./seo/sitemap-routes`](sitemaps-and-publication.md)                           | `locale`                                                         | routes                   |
| [`./seo/sitemap-types`](sitemaps-and-publication.md)                            | None                                                             | None                     |
| [`./routing/walk-static-routes`](sitemaps-and-publication.md)                   | None                                                             | None                     |
| [`./routing/types`](sitemaps-and-publication.md)                                | None                                                             | None                     |
| [`./env`](env.md)                                                               | None                                                             | None                     |
| [`./fonts/font-links`](fonts.md)                                                | `fonts`                                                          | None                     |

In the second column, `locale` stands for `virtual:solid-app/locale`, and so on.
In the third, routes is `virtual:file-routes`, from `filesystem-routing`, and
server functions is `virtual:solid-server-function-handler`, from
`@solidjs/vite-plugin`.
