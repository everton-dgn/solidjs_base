# ADRs

Architecture decision records (ADRs) for this repository. Each one says what was
decided, what led to it and what it costs. The date is the day of the decision.

| ADR                                                                    | Decision                                                               | Status                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------- |
| [0001](0001-separate-monorepo.md)                                      | Shared code lives in a separate monorepo                               | Accepted                              |
| [0002](0002-compiled-tooling-package.md)                               | The tooling package ships compiled JavaScript                          | Accepted, amended by 0027             |
| [0003](0003-runtime-package-as-source.md)                              | The runtime package will ship TypeScript source                        | Accepted, implemented in part by 0018 |
| [0004](0004-public-npm-scope.md)                                       | Packages go to the public npm registry under `@evertondgn`             | Accepted                              |
| [0005](0005-release-please.md)                                         | release-please versions each package                                   | Accepted                              |
| [0006](0006-trusted-publishing.md)                                     | The workflow publishes through npm trusted publishing                  | Accepted                              |
| [0007](0007-english.md)                                                | Packages and repository documentation are written in English           | Accepted, partly superseded by 0014   |
| [0008](0008-merge-commits.md)                                          | Pull requests are merged with merge commits                            | Accepted                              |
| [0009](0009-boilerplate-app-in-the-monorepo.md)                        | A copy of the boilerplate runs in the monorepo                         | Accepted                              |
| [0010](0010-ci-runs-what-a-change-affects.md)                          | The CI runs only the jobs a change affects                             | Accepted, amended by 0017             |
| [0011](0011-test-configs-in-the-tooling-package.md)                    | Test configs ship in the tooling package                               | Accepted, amended by 0027             |
| [0012](0012-application-config-preset.md)                              | A preset builds the application Vite config                            | Accepted, amended by 0016 and 0027    |
| [0013](0013-knip-and-stylelint-configs-in-the-tooling-package.md)      | Knip and Stylelint configs ship in the tooling package                 | Accepted, amended by 0027             |
| [0014](0014-boilerplate-copy-docs-in-english.md)                       | The guides of the boilerplate copy are written in English              | Accepted                              |
| [0015](0015-commitlint-and-lefthook-configs-in-the-tooling-package.md) | The commitlint config and the Git hooks ship in the tooling package    | Accepted, amended by 0027             |
| [0016](0016-optional-application-features.md)                          | The application presets turn on only the features the application uses | Accepted, amended by 0027             |
| [0017](0017-main-reuses-the-pull-request-run.md)                       | A push to main reuses the pull request run that checked the same tree  | Accepted                              |
| [0018](0018-runtime-package-middleware.md)                             | The runtime package starts with the middleware steps                   | Accepted, amended by 0019 and 0020    |
| [0019](0019-runtime-security-headers-options.md)                       | The runtime package takes the security header values as options        | Accepted                              |
| [0020](0020-runtime-package-checks-in-its-own-folder.md)               | The runtime package runs its checks in its own folder                  | Accepted                              |
| [0021](0021-installed-application-scenarios.md)                        | Minimal applications test installed packages with both Bun linkers     | Accepted, amended by 0024 to 0029     |
| [0022](0022-runtime-locale-seam.md)                                    | Runtime locale helpers use an application virtual module               | Accepted, amended by 0023             |
| [0023](0023-runtime-locale-requests.md)                                | Locale requests belong to the runtime                                  | Accepted                              |
| [0024](0024-runtime-theme.md)                                          | Theme logic is an explicit runtime feature                             | Accepted                              |
| [0025](0025-packaged-i18n-generator.md)                                | Colocated catalog generation belongs to the tooling package            | Accepted                              |
| [0026](0026-runtime-locale-navigation.md)                              | Locale navigation and tags belong to the runtime                       | Accepted                              |
| [0027](0027-packaged-tool-dependencies.md)                             | Packages supply the tools the application does not import              | Accepted                              |
| [0028](0028-runtime-server-errors.md)                                  | Server error protection belongs to the runtime                         | Accepted                              |
| [0029](0029-packaged-environment-schemas.md)                           | The runtime package supplies optional environment validators           | Accepted                              |

## Adding a record

Copy the shape of an existing record: title, status, date, then the Context,
Decision and Consequences sections. Use the next number. When a decision
changes, write a new record and set the old one to "Superseded by" with a link,
instead of rewriting it.
