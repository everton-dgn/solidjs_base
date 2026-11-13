# 0014. The guides of the boilerplate copy are written in English

- Status: Accepted
- Date: 2026-11-13

## Context

[ADR 0007](0007-english.md) kept the Portuguese code and guides of
`apps/boilerplate`, the copy of boilerplate_solidjs. The rest of the repository
is in English, the lint messages of the copy are in English since
[ADR 0013](0013-knip-and-stylelint-configs-in-the-tooling-package.md), and the
repository is being prepared for outside contributors. A contributor who changes
a package has to read `apps/boilerplate/AGENTS.md` and the guides in
`apps/boilerplate/docs/` to know what the copy expects.

## Decision

`apps/boilerplate/AGENTS.md` and the 17 guides in `apps/boilerplate/docs/` are
written in English. This replaces the part of ADR 0007 about the copy's guides.

The code comments and the test titles of the copy stay in Portuguese, as in the
original. Translating them would turn every sync from the original into a diff
across hundreds of source files.

## Consequences

- Bringing a commit of the original into the copy also means translating the
  documentation it changes. A diff between the guides of the original and of the
  copy shows every line.
- The section anchors changed with the headings. The links inside the copy and
  the two code comments that cite a section point to the English anchors.
- Inside the copy, the guides and the lint messages are in English, and the code
  comments and the test titles are in Portuguese.
- The release guide and the CI workflow the guides cite exist only in the
  original, so their links point to the original repository at the copied
  commit.
