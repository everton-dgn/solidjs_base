# 0007. Packages and repository documentation are written in English

- Status: Accepted, partly superseded by
  [0014](0014-boilerplate-copy-docs-in-english.md)
- Date: 2026-11-12

## Context

The packages are public on npm. An application sees their lint messages in the
terminal and their README on the npm page. boilerplate_solidjs, where the code
came from, is written in Portuguese.

## Decision

The package README, the lint rule messages, code comments, test titles and the
documentation of this repository are written in English.

`apps/boilerplate` is a copy of boilerplate_solidjs and keeps its Portuguese
code and guides.

## Consequences

- The messages differ from the Portuguese ones still in boilerplate_solidjs.
  When the boilerplate uses the package, its lint messages change to English.
- Inside `apps/boilerplate`, the lint messages are in English and the guides
  they point to are in Portuguese.
