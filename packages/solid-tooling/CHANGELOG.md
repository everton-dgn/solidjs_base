# Changelog

## [0.6.0](https://github.com/everton-dgn/solidjs_base/compare/solid-tooling@0.5.0...solid-tooling@0.6.0) (2026-11-14)


### ⚠ BREAKING CHANGES

* **tooling:** the dom project no longer starts at `http://localhost/en` in every application. Without `project.inlang/settings.json` it starts at `http://localhost/`. With it, it starts under the base locale of that file, such as `http://localhost/fr`, so an application whose base locale is not `en` changes too. Set `domUrl` to `http://localhost/en` (`test.domUrl` in `defineSolidApp`) to keep the old URL. A settings file that cannot be read or has no `baseLocale` now fails the config, unless `domUrl` is set.
* **tooling:** the header rules of the sitemap, llms.txt and Markdown files need publication: true, and an SSR application without project.inlang no longer fails to load the plugins.

### Features

* add runtime locale request seam ([d8fc9cb](https://github.com/everton-dgn/solidjs_base/commit/d8fc9cb16d262c385be1d9c3997ec0d01b8113ec))
* move localized redirects and request tests into runtime ([4c1ce1f](https://github.com/everton-dgn/solidjs_base/commit/4c1ce1f404a819bdcc38149661023b0b2f27ebfe))
* provide an optional runtime locale module ([025d0d7](https://github.com/everton-dgn/solidjs_base/commit/025d0d77fec027ee582536d321b26d60ce77c633))
* **tooling:** apply the solid condition to source packages in the node test project ([b755c43](https://github.com/everton-dgn/solidjs_base/commit/b755c43e0252703dc71237becdd8187743d8b06a))
* **tooling:** start the dom tests where the application starts ([b853d0d](https://github.com/everton-dgn/solidjs_base/commit/b853d0db0b125dc831b1c9c9b9d00fa15dea302e))
* **tooling:** turn on SSR, publication and Paraglide only where the app uses them ([7d02f39](https://github.com/everton-dgn/solidjs_base/commit/7d02f399447c89f514c1f89db1f28c160ea117dd))

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
