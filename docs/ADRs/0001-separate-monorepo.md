# 0001. Shared code lives in a separate monorepo

- Status: Accepted
- Date: 2026-11-11

## Context

boilerplate_solidjs keeps its lint rules, formatter settings, TypeScript config,
i18n generator, Markdown prerender, server error handling and SEO handlers next
to the demo pages. An application created from it copies all of that code, and a
fix has to be repeated in every copy.

Eleven independent analyses of the boilerplate compared the options: a framework
that owns the entry files, a Vite plugin only, a template kept up to date by
merging from upstream, and a few versioned packages with thin files left in the
application. They recommended the packages. A later experiment installed
packages by tarball in a separate application and confirmed that the code can
leave the boilerplate.

Two places could hold the packages: a `packages/` folder inside the boilerplate,
validated by its current suites, or a new repository.

## Decision

The packages live in solidjs_base, a Vite+ monorepo next to boilerplate_solidjs.
The boilerplate and the applications created from it install them from npm. The
first package holds the code with no runtime risk: lint, formatter and
TypeScript config.

A framework of our own was ruled out for now: with the whole stack in
pre-release, every Solid 2 change would mean maintaining one more layer.

## Consequences

- The boilerplate is a consumer like any other application, with no shortcut
  through a workspace link.
- Each extraction crosses two repositories. The boilerplate can only use a
  package after a version is published, because its lockfile cannot point to a
  local tarball.
- Until it opts in, the boilerplate keeps its own copy of the tooling.
  [ADR 0009](0009-boilerplate-app-in-the-monorepo.md) covers how the packages
  are tested against it in the meantime.
