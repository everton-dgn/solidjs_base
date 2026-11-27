# Tooling guides

These are the guides for [`@evertondgn/solid-tooling`](../README.md). They ship
in its npm package, so `node_modules/@evertondgn/solid-tooling/docs/` holds the
guides of the version an app installed. Start with the
[package README](../README.md), which is also its npm page: it shows the
requirements, the first lint result, the whole preset, how the package is
tested, its limits and its entry points. The guides below go into the details,
by task. For the project as a whole, see the
[quick start](https://github.com/everton-dgn/solidjs_base/blob/main/README.md#quick-start)
or the
[documentation index](https://github.com/everton-dgn/solidjs_base/blob/main/docs/README.md).

## Find the guide for your task

| I want to                                                                            | Read                                                                                                                |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Add only lint and format to an existing Vite+ app                                    | [Start with lint and format](../README.md#start-with-lint-and-format), then [Usage](typescript-and-format.md#usage) |
| See the folder layout the preset expects                                             | [Project layout the preset expects](lint.md#project-layout-the-preset-expects)                                      |
| Look up a rule of the package                                                        | [Rules of this package](lint.md#rules-of-this-package)                                                              |
| Know where `fetch`, `console` and the Node transports are allowed                    | [Backend restrictions](lint.md#backend-restrictions)                                                                |
| Turn a rule off or change the lint preset                                            | [Changing the preset](lint.md#changing-the-preset)                                                                  |
| Configure `defineSolidApp` and its optional features                                 | [Application config](app-config.md)                                                                                 |
| Add Vite plugins to the preset                                                       | [`extend`](app-config.md#extend)                                                                                    |
| Replace or add a `vp run` task                                                       | [Tasks](app-config.md#tasks)                                                                                        |
| Map an icon collection or a folder of SVG files                                      | [Icons](app-config.md#icons)                                                                                        |
| Load fonts with matching preloads                                                    | [Application fonts](fonts.md)                                                                                       |
| Turn on SEO, sitemaps, Markdown pages and `llms.txt`                                 | [Optional SEO configuration](app-config.md#optional-seo-configuration)                                              |
| Check the files the build writes for crawlers                                        | [Publication artifacts](app-config.md#publication-artifacts)                                                        |
| Validate environment values                                                          | [Optional environment validation](app-config.md#optional-environment-validation)                                    |
| Ship a client-only build to a static host, a folder, another backend or an app shell | [Applications with no server](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/no-server.md)      |
| Set up the node, DOM, browser and end-to-end tests                                   | [Testing](testing.md)                                                                                               |
| Find unused files, exports and dependencies                                          | [Knip](knip-and-css.md#knip)                                                                                        |
| Apply the CSS token policy                                                           | [CSS lint](knip-and-css.md#css-lint)                                                                                |
| Install and customize commitlint and the Git hooks                                   | [Commit messages and Git hooks](commits-and-hooks.md)                                                               |
| Extend a TypeScript config                                                           | [TypeScript base](typescript-and-format.md#typescript-base)                                                         |
| Check the formatter settings                                                         | [Formatter](typescript-and-format.md#formatter)                                                                     |
| Install compatible dependencies                                                      | [Requirements](limits.md#requirements)                                                                              |
| Check what the package does not cover yet                                            | [Known limits](limits.md#known-limits)                                                                              |
| Read the version policy                                                              | [Versions](limits.md#versions)                                                                                      |

## Entry points

The [package README](../README.md#entry-points) lists every entry of the
package's `exports` and what each one holds.
