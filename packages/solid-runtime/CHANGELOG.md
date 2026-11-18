# Changelog

## [0.10.0](https://github.com/everton-dgn/solidjs_base/compare/solid-runtime@0.9.0...solid-runtime@0.10.0) (2026-11-18)


### ⚠ BREAKING CHANGES

* **runtime:** @evertondgn/solid-runtime requires @solidjs/web 2.0.0. Update solid-js, @solidjs/web and @solidjs/router to 2.0.0 together, with the overrides of @solidjs/signals and @solidjs/compiler at the same version.

### Bug Fixes

* **runtime:** require Solid 2.0.0 ([0ac79e0](https://github.com/everton-dgn/solidjs_base/commit/0ac79e023967abd4589da9d49a32edbb93c369b6))

## [0.9.0](https://github.com/everton-dgn/solidjs_base/compare/solid-runtime@0.8.0...solid-runtime@0.9.0) (2026-11-17)


### Miscellaneous Chores

* **solid-runtime:** Synchronize solid packages versions

## [0.8.0](https://github.com/everton-dgn/solidjs_base/compare/solid-runtime@0.7.0...solid-runtime@0.8.0) (2026-11-16)


### ⚠ BREAKING CHANGES

* @evertondgn/solid-runtime and @evertondgn/vite-plugin-solid-icons take @solidjs/web 2.0.0-rc.23 as their exact peer, and @evertondgn/solid-tooling installs that version of the icons plugin, so an application on Solid 2.0.0-rc.21 no longer meets them. Update solid-js and @solidjs/web to 2.0.0-rc.23 together, with the overrides of @solidjs/signals and @solidjs/compiler at the same version, and remove a patchedDependencies entry for @solidjs/web@2.0.0-rc.21: the new version ends a render whose default serializer fails synchronously before the first flush, and a render abandoned inside its first write no longer ends the Node process. The types of HydrationContext no longer declare serialize; write hydration values through getHydrationWriter of @solidjs/web.
* **runtime:** @evertondgn/solid-runtime declares Node 26.13.1 or later in engines.node. Run the application, including its production server, on Node 26.13.1 or a later version. A package manager that checks engines warns about, or refuses, an older Node.

### Bug Fixes

* require Solid 2.0.0-rc.23 ([4689ef0](https://github.com/everton-dgn/solidjs_base/commit/4689ef0418142078e13582956e72091b830b6001))
* **runtime:** require Node 26 ([93bc52d](https://github.com/everton-dgn/solidjs_base/commit/93bc52dfb5e5685d914ed33c55da620588bd70c4))

## [0.7.0](https://github.com/everton-dgn/solidjs_base/compare/solid-runtime@0.6.0...solid-runtime@0.7.0) (2026-11-15)


### Features

* **runtime:** persist the theme choice in localStorage ([319c842](https://github.com/everton-dgn/solidjs_base/commit/319c842a7fa4f23f8112ff0797950759a8bce8f1))
* **runtime:** set theme-color once the meta follows the stored theme script ([0eadfff](https://github.com/everton-dgn/solidjs_base/commit/0eadfff449be17cf6ae9c7f7b8ed670651ec99df))

## [0.6.0](https://github.com/everton-dgn/solidjs_base/compare/solid-runtime@0.1.0...solid-runtime@0.6.0) (2026-11-15)


The version number follows `@evertondgn/solid-tooling`: both packages share the same number from this release on.


### Bug Fixes

* **runtime:** keep the Solid plugin out of production installs ([927cbee](https://github.com/everton-dgn/solidjs_base/commit/927cbee44f67f9c245c561f74b037aac0dedaf79))

## [0.1.0](https://github.com/everton-dgn/solidjs_base/tree/solid-runtime@0.1.0) (2026-11-14)

First release. It was published by hand, before release-please managed the package.


### Features

* **tooling:** apply the solid condition to source packages in the node test project ([b755c43](https://github.com/everton-dgn/solidjs_base/commit/b755c43e0252703dc71237becdd8187743d8b06a))
* **runtime:** move the middleware steps to @evertondgn/solid-runtime ([53415a1](https://github.com/everton-dgn/solidjs_base/commit/53415a1792d432f595c4659cfe7053b91a663abc))
* **runtime:** take the security headers and CSP directives as options ([6e32859](https://github.com/everton-dgn/solidjs_base/commit/6e32859ad9bb901b5395020130b8c3b2fc9a3434))
* **runtime:** refuse at creation a header or directive that cannot be sent ([fda7815](https://github.com/everton-dgn/solidjs_base/commit/fda7815f3b3f3e02fbe57d7fcdaf935316f4cb74))
* provide an optional runtime locale module ([025d0d7](https://github.com/everton-dgn/solidjs_base/commit/025d0d77fec027ee582536d321b26d60ce77c633))
* **runtime:** extract locale URL helpers and Vary merging ([e235eb8](https://github.com/everton-dgn/solidjs_base/commit/e235eb8f5ae5c89577853e555517646ac82679cb))
* add runtime locale request seam ([d8fc9cb](https://github.com/everton-dgn/solidjs_base/commit/d8fc9cb16d262c385be1d9c3997ec0d01b8113ec))
* move localized redirects and request tests into runtime ([4c1ce1f](https://github.com/everton-dgn/solidjs_base/commit/4c1ce1f404a819bdcc38149661023b0b2f27ebfe))
* **runtime:** add configurable opt-in theme modules ([501972c](https://github.com/everton-dgn/solidjs_base/commit/501972c4643cc0960ec262736d1e5edbe7195988))
* **runtime:** expose locale navigation and language tags ([d7f45c9](https://github.com/everton-dgn/solidjs_base/commit/d7f45c9d85810cf3207ee3eb86ebe81b560e5614))
* **runtime:** add server error protection ([bd3a80c](https://github.com/everton-dgn/solidjs_base/commit/bd3a80c3fca46ad88f7a07380ebaa3727b70137f))
* **tooling:** supply application tools from shared packages ([55722a4](https://github.com/everton-dgn/solidjs_base/commit/55722a444e23748ae045ba25075ef69df944c531))
* **runtime:** package middleware composition and entry helpers ([a65ce01](https://github.com/everton-dgn/solidjs_base/commit/a65ce0189fa3f7fbc0add4cd6165c60d8cbd7764))
* **tooling:** export optional preset environment schemas ([8405450](https://github.com/everton-dgn/solidjs_base/commit/8405450da7e41237896febb56849f51682ccbd1b))
* **seo:** add configurable runtime metadata and robots APIs ([08013d8](https://github.com/everton-dgn/solidjs_base/commit/08013d8c7d8f8a3e67d74c5c7a554d5447af1f5f))
* **fonts:** load application fonts through the preset ([8e2d430](https://github.com/everton-dgn/solidjs_base/commit/8e2d430444cdc9ad4e9e0678aa652341c9f2a4ef))
* **runtime:** add injectable sitemap and publication factories ([1a2caa9](https://github.com/everton-dgn/solidjs_base/commit/1a2caa98ab8c16fbf521dfa76f9fec56e61dd306))
* **seo:** package Markdown and publication services ([547b550](https://github.com/everton-dgn/solidjs_base/commit/547b5509d2f2f5b81295287e2c9cfd1333d89657))
