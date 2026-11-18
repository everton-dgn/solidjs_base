# 0040. Package documentation ships with the package

- Status: Accepted
- Date: 2026-11-18

## Context

Each package README is also the npm page of its package. The READMEs grew a
reference written for maintainers: the runtime README reached 1,481 lines, about
half of them in its `Reference` section. The guides of the tooling package lived
in `docs/tooling/` at the root of the repository, outside the tarball. A
developer or an agent working in an installed application reads the README of
the version it has in `node_modules`, while the guides that README linked lived
on `main` and described the next version.

The options were:

- Keeping the reference in each README.
- Moving it to a folder of the root `docs/`, linked by absolute URL to `main`.
- Moving it to a `docs/` folder inside each package and publishing that folder
  with the package.

## Decision

- Each package keeps its guides in `packages/<name>/docs/`, and the `files`
  field of its `package.json` lists `docs`, so the tarball carries the guides of
  its version.
- The README keeps what a reader needs to decide and to start: what the package
  is, its requirements, the install command, a working example, what to import,
  how it is tested and its known limits. A `Reference` section links the guides.
- A relative link in `packages/<name>/README.md` or `packages/<name>/docs/`
  points only to a file inside the same package folder that the tarball carries.
  A link to anything else in the repository, such as an ADR, another package or
  the boilerplate app, uses the absolute
  `https://github.com/everton-dgn/solidjs_base/blob/main/...` URL, as the
  package READMEs already did.
- The root `docs/` keeps the documents of the monorepo: architecture,
  development, releasing and the ADRs.
- `docs/tooling/no-server.md` stays where it is, because the installed
  application scenarios read that path. The other files of `docs/tooling/` keep
  a short pointer with the headings that published npm pages link to.

## Consequences

- An installed application has the guides of its version in
  `node_modules/<package>/docs/`, and each tarball grows by the size of those
  Markdown files.
- A change to a guide reaches npm only with the next published version, as a
  change to the README does.
- A guide belongs to its package folder, so release-please assigns a commit that
  edits it to that package. A `docs` commit does not start a release.
- The link check of the Docs job reads `packages/*/docs/**/*.md` too. The
  package READMEs link to their own guides by absolute URL on `main`, as they do
  for every other file, because they are also the npm pages; the check maps
  those URLs back to the checkout.
- The npm pages of versions published before this decision link to
  `docs/tooling/` on `main`. The pointers keep those links working.
