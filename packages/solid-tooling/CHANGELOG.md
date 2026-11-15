# Changelog

## [0.6.0](https://github.com/everton-dgn/solidjs_base/compare/solid-tooling@0.5.0...solid-tooling@0.6.0) (2026-11-15)


### ⚠ BREAKING CHANGES

* **tooling:** the header rules of `/sitemap.xml`, `/sitemaps/pages/**`, `/llms.txt`, `/llms-full.txt`, the Markdown files and `/_markdown/static.json` are no longer emitted by default. Enable each one with its SEO option in `defineSolidApp`: `seo.sitemap` (`true`, or `{ static: true }` for the compiled sitemap artifacts), `seo.llms`, `seo.llmsFull` and `seo.markdown: { static: true }`. The `publication` option, added and removed during this release, is rejected with a migration message.
* **tooling:** Remove preset-only @solidjs/vite-plugin, nitro, filesystem-routing, unplugin-icons, knip, happy-dom, playwright, @playwright/test, @vitest/browser-playwright, @vitest/coverage-v8, @vitest/ui, @testing-library/jest-dom, @types/node, typescript, @commitlint/cli and lefthook from application manifests. Keep any library the application imports directly. Use packaged tasks for tool binaries and inherit the package type references. The standalone vitest declaration is unnecessary when using vite-plus/test; keep the Vite/Vitest overrides, Vite+ and application runtime dependencies.
* **tooling:** the dom project no longer starts at `http://localhost/en` in every application. Without `project.inlang/settings.json` it starts at `http://localhost/`. With it, it starts under the base locale of that file, such as `http://localhost/fr`, so an application whose base locale is not `en` changes too. Set `domUrl` to `http://localhost/en` (`test.domUrl` in `defineSolidApp`) to keep the old URL. A settings file that cannot be read or has no `baseLocale` now fails the config, unless `domUrl` is set.
* **tooling:** an SSR application without project.inlang no longer fails to load the plugins.

### Features

* add runtime locale request seam ([d8fc9cb](https://github.com/everton-dgn/solidjs_base/commit/d8fc9cb16d262c385be1d9c3997ec0d01b8113ec))
* **fonts:** load application fonts through the preset ([8e2d430](https://github.com/everton-dgn/solidjs_base/commit/8e2d430444cdc9ad4e9e0678aa652341c9f2a4ef))
* move localized redirects and request tests into runtime ([4c1ce1f](https://github.com/everton-dgn/solidjs_base/commit/4c1ce1f404a819bdcc38149661023b0b2f27ebfe))
* provide an optional runtime locale module ([025d0d7](https://github.com/everton-dgn/solidjs_base/commit/025d0d77fec027ee582536d321b26d60ce77c633))
* release 0.6.0 with the runtime package and optional features ([36b20fb](https://github.com/everton-dgn/solidjs_base/commit/36b20fb2b854169ef06049cbf09133fc21828f37))
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
