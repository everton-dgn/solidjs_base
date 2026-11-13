# 0003. The runtime package will ship TypeScript source

- Status: Accepted, implemented in part by
  [ADR 0018](0018-runtime-package-middleware.md)
- Date: 2026-11-11

## Context

The runtime code of the boilerplate (middleware, security headers, server
errors, i18n runtime, primitives and the SEO handlers) runs inside the
application build: the Solid compiler, the Nitro server build and the Paraglide
modules generated in each application.

An experiment installed a minimal runtime package by tarball in a separate
application and ran dev, build and preview:

| Question                                   | Result                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Package source in SSR under Nitro          | Passed in dev, build and preview; hydration finished with no console error                                   |
| One-line routes that re-export a handler   | Passed in dev and preview; the handler code did not reach the client bundle                                  |
| `@paraglide/*` imported inside the package | Failed in build and dev without an alias; correct in `/en`, `/pt` and `/es` with `resolve.alias`             |
| Middleware as `.ts` source                 | Passed in the three modes and read the request locale                                                        |
| Middleware compiled to `.js`               | The build passed, but `/pt` answered in English; with the package in `ssr.noExternal`, it answered correctly |

## Decision

The runtime package will ship TypeScript source with the `solid` export
condition, compiled by the application's Vite. A preset from the package adds
the `@paraglide` alias and puts the package in `ssr.noExternal`.

## Consequences

- The application compiles the package code in its own build, with its own Solid
  and Paraglide versions.
- Not tested yet: `virtual:file-routes` imported from inside the package,
  message catalogs inside a package, Vitest with the package in `node_modules`,
  and shipping the patched `@mdream/js` inside the package.
- The cause of the wrong locale with compiled `.js` was not proven. A second
  instance of the Paraglide runtime is the likely one.
