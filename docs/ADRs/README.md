# ADRs

Architecture decision records (ADRs) for this repository. Each one says what was
decided, what led to it and what it costs. The date is the day of the decision.

| ADR                                                               | Decision                                                     | Status                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------- |
| [0001](0001-separate-monorepo.md)                                 | Shared code lives in a separate monorepo                     | Accepted                  |
| [0002](0002-compiled-tooling-package.md)                          | The tooling package ships compiled JavaScript                | Accepted                  |
| [0003](0003-runtime-package-as-source.md)                         | The runtime package will ship TypeScript source              | Accepted, not implemented |
| [0004](0004-public-npm-scope.md)                                  | Packages go to the public npm registry under `@evertondgn`   | Accepted                  |
| [0005](0005-release-please.md)                                    | release-please versions each package                         | Accepted                  |
| [0006](0006-trusted-publishing.md)                                | The workflow publishes through npm trusted publishing        | Accepted                  |
| [0007](0007-english.md)                                           | Packages and repository documentation are written in English | Accepted                  |
| [0008](0008-merge-commits.md)                                     | Pull requests are merged with merge commits                  | Accepted                  |
| [0009](0009-boilerplate-app-in-the-monorepo.md)                   | A copy of the boilerplate runs in the monorepo               | Accepted                  |
| [0010](0010-ci-runs-what-a-change-affects.md)                     | The CI runs only the jobs a change affects                   | Accepted                  |
| [0011](0011-test-configs-in-the-tooling-package.md)               | Test configs ship in the tooling package                     | Accepted                  |
| [0013](0013-knip-and-stylelint-configs-in-the-tooling-package.md) | Knip and Stylelint configs ship in the tooling package       | Accepted                  |

## Adding a record

Copy the shape of an existing record: title, status, date, then the Context,
Decision and Consequences sections. Use the next number. When a decision
changes, write a new record and set the old one to "Superseded by" with a link,
instead of rewriting it.
