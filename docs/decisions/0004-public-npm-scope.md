# 0004. Packages go to the public npm registry under `@evertondgn`

- Status: Accepted
- Date: 2026-11-12

## Context

The applications that use the packages live in their own repositories, so the
packages need a registry. GitHub Packages can keep a package private, but every
application and every CI job would need a token to install it, and the scope has
to match the GitHub account or an organization. The public npm registry needs no
token to install.

The first scope chosen, `@devinsights`, needed an organization with that name.
The owner chose not to create an organization. The npm account is `evertondgn`,
without the hyphen of the GitHub user `everton-dgn`, so `@everton-dgn` does not
exist on npm.

## Decision

Packages are published to the public npm registry under `@evertondgn`, the scope
of the personal npm account. The GitHub repository is public too.

## Consequences

- Any application installs the packages without a token or extra registry
  configuration.
- The code is public on npm and on GitHub.
- Published versions stay on the registry. A bad version is replaced by a new
  one or deprecated.
- The "Packages" box of the GitHub repository page stays empty: it lists only
  GitHub Packages.
