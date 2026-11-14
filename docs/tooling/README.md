# Tooling reference

| Guide                                                 | Read it when you want to                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [Lint](lint.md)                                       | Understand the rules, backend restrictions and expected layout, or change the preset |
| [Application config](app-config.md)                   | Configure `defineSolidApp`, optional features, plugins and tasks                     |
| [Testing](testing.md)                                 | Set up the node, DOM, browser and end-to-end tests                                   |
| [Knip and CSS](knip-and-css.md)                       | Find unused code and apply the CSS token policy                                      |
| [Commit messages and Git hooks](commits-and-hooks.md) | Install and customize commitlint and Lefthook                                        |
| [TypeScript and formatting](typescript-and-format.md) | Start with lint and format, or extend a TypeScript config                            |
| [Requirements, limits and versions](limits.md)        | Install compatible dependencies and check the constraints                            |

## Overview

Lint preset, formatter config, TypeScript configs, test configs, the Knip and
Stylelint configs, the Vite+ application config, the commitlint config and the
Git hooks for SolidJS 2 applications built with
[Vite+](https://viteplus.dev/guide/).

The package contains the lint, format, TypeScript, test, build, dead code, CSS
lint, commit message and Git hook setup of
[boilerplate_solidjs](https://github.com/everton-dgn/boilerplate_solidjs), a
SolidJS application template. Applications created from it install the package
instead of copying the files, so a rule change reaches them through a version
update.

## Entry points

| Entry                    | Content                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| `./lint`                 | `lint`: the lint preset, with the plugins below registered                |
| `./fmt`                  | `fmt`: the formatter config                                               |
| `./tsconfig.base.json`   | Compiler options, without application paths                               |
| `./tsconfig.app.json`    | The base plus the `types` and `include` of the boilerplate layout         |
| `./vite`                 | `defineSolidApp(options)`, the whole `vite.config.ts` of an application   |
| `./i18n-generate`        | Compiled catalog generator executed by the preset's `i18n-generate` task  |
| `./vitest`               | `solidTest(options)`, the `test` block of `vite.config.ts`                |
| `./playwright`           | `definePlaywrightConfig(options)`, the Playwright config                  |
| `./vitest-setup/browser` | Setup file of the browser project, loaded by `./vitest`                   |
| `./playwright-teardown`  | Server log check, loaded by `./playwright`                                |
| `./project-plugin`       | The `project` rules                                                       |
| `./backend-plugin`       | The `backend` rules                                                       |
| `./architecture-plugin`  | The `architecture` rule                                                   |
| `./solid-plugin`         | Re-export of `eslint-plugin-solid`                                        |
| `./css-filename`         | `cssFilenameError(path)`, the CSS naming check, for a script outside lint |
| `./knip`                 | `defineKnipConfig(options)`, the Knip config                              |
| `./stylelint`            | `checkCss(root)` and `defineStylelintConfig(root)`, the CSS lint          |
| `./commitlint`           | The commitlint config                                                     |
| `./lefthook.yml`         | The Git hooks, extended from the application's `.lefthook.yml`            |

An application imports `./vite`, which brings `./lint`, `./fmt` and `./vitest`
along, `./playwright`, `./knip`, `./stylelint` and one of the TypeScript
configs, and extends `./commitlint` and `./lefthook.yml`. An application that
only lints imports `./lint` and `./fmt`. The plugin entries exist because Oxlint
loads plugins by specifier, from the application; the setup and teardown entries
are loaded by the test presets.

See the [project quick start](../../README.md#quick-start) or the
[documentation index](../README.md).
