# Changelog

## [0.9.0](https://github.com/everton-dgn/solidjs_base/compare/solid-tooling@0.8.0...solid-tooling@0.9.0) (2026-11-17)


### ⚠ BREAKING CHANGES

* **tooling:** @evertondgn/solid-tooling registers a tsrs task in place of tsc and no longer installs typescript. Replace vp run tsc with vp run tsrs, and the packaged command node_modules/@evertondgn/solid-tooling/dist/cli.mjs tsc with its tsrs form. tsrs has no --init and no --showConfig, and its --watch does not run on Windows.
* **tooling:** @evertondgn/solid-tooling requires vite-plus 1.7.0. Update vite-plus and the vite alias together, with vp migrate or by setting the alias to the output of npm view vite-plus@1.7.0 dependencies.vite.

### Features

* **tooling:** check the types with tsrs instead of tsc ([29b1f44](https://github.com/everton-dgn/solidjs_base/commit/29b1f4461e4c6a349977ae5c155c06dd7eafe63c))


### Bug Fixes

* **tooling:** require Vite+ 1.7.0 ([b6e8bb2](https://github.com/everton-dgn/solidjs_base/commit/b6e8bb2ae0c3f7638c60caa7d88384f49598b122))

## [0.8.0](https://github.com/everton-dgn/solidjs_base/compare/solid-tooling@0.7.0...solid-tooling@0.8.0) (2026-11-16)


### ⚠ BREAKING CHANGES

* @evertondgn/solid-runtime and @evertondgn/vite-plugin-solid-icons take @solidjs/web 2.0.0-rc.23 as their exact peer, and @evertondgn/solid-tooling installs that version of the icons plugin, so an application on Solid 2.0.0-rc.21 no longer meets them. Update solid-js and @solidjs/web to 2.0.0-rc.23 together, with the overrides of @solidjs/signals and @solidjs/compiler at the same version, and remove a patchedDependencies entry for @solidjs/web@2.0.0-rc.21: the new version ends a render whose default serializer fails synchronously before the first flush, and a render abandoned inside its first write no longer ends the Node process. The types of HydrationContext no longer declare serialize; write hydration values through getHydrationWriter of @solidjs/web.
* **tooling:** @evertondgn/solid-tooling declares Node 26.13.1 or later in engines.node. Run the application, its scripts and its CI on Node 26.13.1 or a later version. A package manager that checks engines warns about, or refuses, an older Node.
* **tooling:** @evertondgn/solid-tooling installs @types/node 26, so an application type-checks against the Node 26 API. Run the application on Node 26, the line the packages declare in engines.node.
* **tooling:** defineSolidApp loads `@evertondgn/vite-plugin-solid-icons` in place of `unplugin-icons`, which the tooling no longer installs; an application that imports `unplugin-icons` itself declares it in its own `package.json`. To migrate, as [Migrating from `~icons/`](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/app-config.md#migrating-from-icons) describes: replace each `~icons/<collection>/<name>` import with `icon:<collection>/<name>`; `icon:<collection>` also exports each icon by its name. Delete the declaration of the `~icons/*` modules, such as `src/@types/icons.d.ts`: the `app-env` types of `tsconfig.app.json` declare the `icon:` imports and `@evertondgn/vite-plugin-solid-icons/types`, so an application with its own `types` list keeps `@evertondgn/solid-tooling/app-env` there and does not declare the plugin. Add `src/icon-collections.d.ts` to `.gitignore`: the dev server, the build and the new `icons-generate` task write the typed names of every collection there, and `lint-project` and `check-project` run the task first; run `vp run icons-generate` before a `vp lint` or a `tsc` outside these tasks when the application imports icons by name. Only `?raw` is accepted in an import, without a value (`?raw=true` stops the build too): the old plugin turned the other keys of a query into attributes of the `<svg>`, as in `?width=2em`, and the build now stops on any other query, `?url` included; pass the attributes as props of the component, import the file of a folder collection with the `?url` of Vite, or build a data URL from `?raw`. A collection name uses lowercase letters, digits and single hyphens, and another name in `icons` stops the configuration. An import names the SVG file exactly, in its case, where the old loader also tried the camelCase, PascalCase and snake_case names. The build stops on an SVG file with markup that runs code or that a page reads as HTML, such as `<script>`, an event handler attribute, a `javascript:` URL or `<foreignObject>`, and on a file that is not well-formed XML, where the old loader read the file as it was. The folders of `icons` still resolve from `root`, `aria-hidden` is still set on every icon, and the Iconify collections still load by their name; install each one as `@iconify-json/<collection>`, because the declarations of the names and the Knip config know only those packages, not `@iconify/json`.

### Features

* **tooling:** load the icons with @evertondgn/vite-plugin-solid-icons ([c0a36b1](https://github.com/everton-dgn/solidjs_base/commit/c0a36b1eebb8741ed63309ba747c364f0bd4f36b))


### Bug Fixes

* require Solid 2.0.0-rc.23 ([4689ef0](https://github.com/everton-dgn/solidjs_base/commit/4689ef0418142078e13582956e72091b830b6001))
* **tooling:** install the Node 26 types ([5bbabee](https://github.com/everton-dgn/solidjs_base/commit/5bbabee85c9254af062769901fc040ad7fcd35bb))
* **tooling:** require Node 26 ([5e23460](https://github.com/everton-dgn/solidjs_base/commit/5e2346068a16dd0ad0fb363d1eaad6cfe6c7d2cc))
* **tooling:** update Playwright to 1.65.1 ([4ca55aa](https://github.com/everton-dgn/solidjs_base/commit/4ca55aaf2ae93df40787840d8cac915cbaca2f46))

## [0.7.0](https://github.com/everton-dgn/solidjs_base/compare/solid-tooling@0.6.0...solid-tooling@0.7.0) (2026-11-15)


### Features

* **tooling:** accept a relative base for client-only fonts ([74a3bfb](https://github.com/everton-dgn/solidjs_base/commit/74a3bfba2da97814523bf538a7b71077acd355d1))


### Bug Fixes

* **tooling:** refuse a fonts assetsDir that a host decodes into a parent ([484f4bf](https://github.com/everton-dgn/solidjs_base/commit/484f4bff146a453009e18c6a77faa87ff77a95e2))
* **tooling:** refuse a fonts assetsDir whose URL leaves the output ([a68f4c0](https://github.com/everton-dgn/solidjs_base/commit/a68f4c0213b9d8edced0ee4310c73119a3f861ad))
* **tooling:** refuse a fonts assetsDir with an encoded parent segment ([e18b958](https://github.com/everton-dgn/solidjs_base/commit/e18b95898107ef8cb7a3c289c50a20d9151e21f5))

## [0.6.0](https://github.com/everton-dgn/solidjs_base/compare/solid-tooling@0.5.0...solid-tooling@0.6.0) (2026-11-15)


### ⚠ BREAKING CHANGES

* **tooling:** the header rules of `/sitemap.xml`, `/sitemaps/pages/**`, `/llms.txt`, `/llms-full.txt`, the Markdown files and `/_markdown/static.json` are no longer emitted by default. Enable each one with its SEO option in `defineSolidApp`: `seo.sitemap` (`true`, or `{ static: true }` for the compiled sitemap artifacts), `seo.llms`, `seo.llmsFull` and `seo.markdown: { static: true }`.
* **tooling:** Remove preset-only @solidjs/vite-plugin, nitro, filesystem-routing, unplugin-icons, knip, happy-dom, playwright, @playwright/test, @vitest/browser-playwright, @vitest/coverage-v8, @vitest/ui, @testing-library/jest-dom, @types/node, typescript, @commitlint/cli and lefthook from application manifests. Keep any library the application imports directly. Use packaged tasks for tool binaries and inherit the package type references. The standalone vitest declaration is unnecessary when using vite-plus/test; keep the Vite/Vitest overrides, Vite+ and application runtime dependencies.
* **tooling:** the dom project no longer starts at `http://localhost/en` in every application. Without `project.inlang/settings.json` it starts at `http://localhost/`. With it, it starts under the base locale of that file, such as `http://localhost/fr`, so an application whose base locale is not `en` changes too. Set `domUrl` to `http://localhost/en` (`test.domUrl` in `defineSolidApp`) to keep the old URL. A settings file that cannot be read or has no `baseLocale` now fails the config, unless `domUrl` is set. `domUrl` skips only that base locale read: with `seo.markdown: { static: true }`, a settings file whose locales cannot be read still fails the config.

### Features

* add runtime locale request seam ([d8fc9cb](https://github.com/everton-dgn/solidjs_base/commit/d8fc9cb16d262c385be1d9c3997ec0d01b8113ec))
* **fonts:** load application fonts through the preset ([8e2d430](https://github.com/everton-dgn/solidjs_base/commit/8e2d430444cdc9ad4e9e0678aa652341c9f2a4ef))
* move localized redirects and request tests into runtime ([4c1ce1f](https://github.com/everton-dgn/solidjs_base/commit/4c1ce1f404a819bdcc38149661023b0b2f27ebfe))
* provide an optional runtime locale module ([025d0d7](https://github.com/everton-dgn/solidjs_base/commit/025d0d77fec027ee582536d321b26d60ce77c633))
* **runtime:** expose locale navigation and language tags ([d7f45c9](https://github.com/everton-dgn/solidjs_base/commit/d7f45c9d85810cf3207ee3eb86ebe81b560e5614))
* **runtime:** package middleware composition and entry helpers ([a65ce01](https://github.com/everton-dgn/solidjs_base/commit/a65ce0189fa3f7fbc0add4cd6165c60d8cbd7764))
* **seo:** add configurable runtime metadata and robots APIs ([08013d8](https://github.com/everton-dgn/solidjs_base/commit/08013d8c7d8f8a3e67d74c5c7a554d5447af1f5f))
* **seo:** package Markdown and publication services ([547b550](https://github.com/everton-dgn/solidjs_base/commit/547b5509d2f2f5b81295287e2c9cfd1333d89657))
* **tooling:** apply the solid condition to source packages in the node test project ([b755c43](https://github.com/everton-dgn/solidjs_base/commit/b755c43e0252703dc71237becdd8187743d8b06a))
* **tooling:** enforce runtime server error boundaries ([8fdc26c](https://github.com/everton-dgn/solidjs_base/commit/8fdc26c575a9a51d719e1f37f0f01733074f4b2c))
* **tooling:** export optional preset environment schemas ([8405450](https://github.com/everton-dgn/solidjs_base/commit/8405450da7e41237896febb56849f51682ccbd1b))
* **tooling:** make sitemap headers opt-in ([137fc27](https://github.com/everton-dgn/solidjs_base/commit/137fc2721f4ae0cea2b8f472c4e2021dd3156a86))
* **tooling:** package i18n generation and preset integration ([eee7002](https://github.com/everton-dgn/solidjs_base/commit/eee700225b3777c816f74b30d364b18e3fe899a7))
* **tooling:** start the dom tests where the application starts ([b853d0d](https://github.com/everton-dgn/solidjs_base/commit/b853d0db0b125dc831b1c9c9b9d00fa15dea302e))
* **tooling:** supply application tools from shared packages ([55722a4](https://github.com/everton-dgn/solidjs_base/commit/55722a444e23748ae045ba25075ef69df944c531))
* **tooling:** turn on SSR, publication and Paraglide only where the app uses them ([7d02f39](https://github.com/everton-dgn/solidjs_base/commit/7d02f399447c89f514c1f89db1f28c160ea117dd))


### Bug Fixes

* **seo:** preserve security responses and publication identity ([be0263e](https://github.com/everton-dgn/solidjs_base/commit/be0263e0745a541464650706c63249616e66171c))
* **tooling:** close server error policy bypasses ([d6883c3](https://github.com/everton-dgn/solidjs_base/commit/d6883c36971f845d0610aa0aa7321a9f49ae16a9))

## [0.5.0](https://github.com/everton-dgn/solidjs_base/compare/solid-tooling@0.4.0...solid-tooling@0.5.0) (2026-11-13)


### Features

* **tooling:** ship the commitlint config and the Git hooks ([e9a2fd1](https://github.com/everton-dgn/solidjs_base/commit/e9a2fd170da86f20b515fbeddc49764888644585))


### Bug Fixes

* **tooling:** list the configured tools in the package keywords ([bdfe70d](https://github.com/everton-dgn/solidjs_base/commit/bdfe70dce9e116ae695b83a522ad7b6419d4110d))

## [0.4.0](https://github.com/everton-dgn/solidjs_base/compare/solid-tooling@0.3.0...solid-tooling@0.4.0) (2026-11-13)


### Features

* **tooling:** add a defineSolidApp preset for Vite, Nitro and the vp run tasks ([42efa5c](https://github.com/everton-dgn/solidjs_base/commit/42efa5c04048e956f9901cab5d6b36db46647d68))
* **tooling:** add Knip and Stylelint config factories ([80f4016](https://github.com/everton-dgn/solidjs_base/commit/80f4016673967320465b7e8dedf0bad7c7e68885))

## [0.3.0](https://github.com/everton-dgn/solidjs_base/compare/solid-tooling@0.2.0...solid-tooling@0.3.0) (2026-11-13)


### Features

* **tooling:** ship Vitest and Playwright configs and an app tsconfig ([5ee49d9](https://github.com/everton-dgn/solidjs_base/commit/5ee49d9dfbbd7512ba00b6f3b070780a73cca341))

## [0.2.0](https://github.com/everton-dgn/solidjs_base/compare/solid-tooling@0.1.0...solid-tooling@0.2.0) (2026-11-12)


### Features

* **tooling:** write rule messages in English ([379e750](https://github.com/everton-dgn/solidjs_base/commit/379e750be87ca5e63f7d9a535e80501478718d14))


### Bug Fixes

* **tooling:** say how to resolve each rule message ([2ea41bd](https://github.com/everton-dgn/solidjs_base/commit/2ea41bd692aa27d4014bcf41af5ed188d6458bf0))

## [0.1.0](https://github.com/everton-dgn/solidjs_base/tree/solid-tooling@0.1.0) (2026-11-12)

First release. It was published by hand, before release-please managed the package.


### Features

* **tooling:** lint and format presets, a TypeScript base config, and the project, backend, architecture and Solid lint plugins ([c7b3de9](https://github.com/everton-dgn/solidjs_base/commit/c7b3de9bc55f321ba062cd43b03a39e61a5908c1))
* **tooling:** resolve eslint-plugin-solid from the package ([2422b35](https://github.com/everton-dgn/solidjs_base/commit/2422b356a33b08adb1df63c3e9649beef45f14de))
* **tooling:** export the CSS filename rule ([78f47c6](https://github.com/everton-dgn/solidjs_base/commit/78f47c6ec890cc93c2d51b1d9150938318c557bc))
