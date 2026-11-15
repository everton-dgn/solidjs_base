# 0027. Packages supply the tools the application does not import

- Status: Accepted
- Date: 2026-11-14
- Supersedes: the tool dependency ownership choices of
  [0002](0002-compiled-tooling-package.md),
  [0011](0011-test-configs-in-the-tooling-package.md),
  [0012](0012-application-config-preset.md),
  [0013](0013-knip-and-stylelint-configs-in-the-tooling-package.md),
  [0015](0015-commitlint-and-lefthook-configs-in-the-tooling-package.md) and
  [0016](0016-optional-application-features.md)

## Context

The preset used tools declared as exact optional peers, so every application
repeated the tested versions even without importing them. Updating the preset
still required updating those declarations. Bun's isolated linker exposes both
missing dependencies and binaries that only appeared to work through hoisting.

The owner chose to install all preset tools with the package, accepting the
installation cost even when a feature is disabled. Feature selection and build
isolation remain unchanged.

## Decision

The tooling package owns exact dependencies for the Solid Vite plugin, Nitro,
filesystem-routing, icons, Knip, TypeScript, Node types, DOM and browser test
tools, coverage, the Vitest UI, matchers, commitlint and Lefthook. They leave
both peer dependency maps. Vite+ remains an exact peer; Paraglide remains an
exact optional peer because generated application code imports its runtime.
Inlang settings still load the application-owned message-format plugin.

The runtime owns filesystem-routing, which its middleware imports, and the Solid
plugin that supplies its re-exported StartMiddleware type. Applications can
import that type from the existing runtime middleware/types entry. Keep Solid,
its web package and router in the application so the compiler and application
use the same instance.

Applications retain libraries their own source imports. The copy keeps Nitro for
publication tooling, filesystem-routing for API helpers and tests, and
Playwright Test for E2E imports. Their versions stay aligned with the package.
Valibot, schema-dts, mdream and icon collections remain application-owned too.
The local Vite+ installation, Vite alias and root Vite/Vitest overrides stay in
each application. Bun applies root overrides and patches to transitive packages.

The preset registers uncached knip, tsc, playwright, lefthook and commitlint
tasks. Its CLI resolves executable entries from its own dependencies and
forwards arguments and exit status, running Knip in Bun and the other tools in
Node. Task commands resolve the compiled CLI beside the preset. Consumers
without defineSolidApp can invoke the same published entry through vp exec; the
shared commit-msg hook uses that path. No transitive binary is expected in the
application's .bin folder.

The application tsconfig lists package-owned node-env.d.ts in files and the
published app-env entry in types. Their references resolve beside the package,
avoiding TS2688 for Node and test types. Separating these declarations preserves
the precedence of generated route types and browser matchers. The installed
client-only fixture checks that browser assertions still return Promise<void>.
The DOM project loads jest-dom's Vitest setup from the package's installation;
the Solid plugin otherwise searches only the application root and skips the
matchers when the application no longer declares jest-dom. The installed fixture
exercises a real DOM matcher to protect this resolution boundary. Knip
explicitly enables its icons plugin after unplugin-icons leaves the application
manifest. It ignores happy-dom, jest-dom and the V8 coverage provider because
Knip attributes the preset's resolved test settings to the application config.
Applications importing these tools directly must still declare them themselves.

Root and fixture manifests set trustedDependencies to an empty array. Bun's
default trusted list otherwise runs Lefthook's postinstall even transitively,
creating a sample config and installing a hook. Hook installation is explicit,
through the packaged CLI after the application creates its config. The tarball
consumer checks both the absence of application-level tool binaries and the
generated commit-msg hook's acceptance and rejection of real messages.

## Measured cost and build isolation

On the development machine, fresh temporary client-only applications installed
the base at 8b5fd2f and the changed packages from tarballs. Dependencies were
cached. Measurements count regular file bytes under node_modules without
following symlinks; the filesystem allocation column comes from du -sk. Browser
downloads and the global Bun cache are excluded. APFS sharing means these
figures do not measure exclusive physical disk ownership.

| Linker   | Before                         | After                          | Increase          | Allocated before / after |
| -------- | ------------------------------ | ------------------------------ | ----------------- | ------------------------ |
| hoisted  | 447,267,407 bytes (426.55 MiB) | 484,873,185 bytes (462.41 MiB) | 35.86 MiB (8.41%) | 474,656 / 536,476 KiB    |
| isolated | 451,599,275 bytes (430.68 MiB) | 490,859,434 bytes (468.12 MiB) | 37.44 MiB (8.69%) | 479,324 / 542,876 KiB    |

Bun reported 241 installed packages before and 323 after. This is one paired
installation per linker, a size measurement rather than a throughput benchmark.
Direct declarations, including injected package tarballs, change as follows:

| Application | Before | After |
| ----------- | ------ | ----- |
| boilerplate | 28     | 16    |
| client-only | 18     | 7     |
| ssr-plain   | 19     | 7     |
| ssr-i18n    | 21     | 9     |
| consumer    | 6      | 3     |

The installed matrix passed its version-alignment check and all eight
application cases in 68.86 seconds, within a 100.31-second root validation. Its
18 bundle inventories contained 1,200 module IDs with no packaged development
tools. The audit distinguishes Nitro's server runtime and routing API from their
build adapters. Disabled i18n, theme and SSR checks still apply. Removing
unplugin-icons from a temporary tooling tarball makes client-only / isolated
fail with ERR_MODULE_NOT_FOUND when the test preset loads its plugins. The
tool-bundle probe imports the actual packaged formatter from the temporary
application and must fail the build audit.

## Consequences

Updating the tooling updates unused tools too. Their installed size is the
accepted cost; application build output must continue to exclude them.
Applications with direct imports keep those declarations and coordinate their
versions to preserve single instances. Re-exporting the middleware type removes
one dependency without introducing a runtime import of the tooling package.

Migration removes preset-only dependencies, changes scripts to the packaged
tasks, and removes named inherited type entries such as node from application
tsconfigs. Applications overriding files must preserve the package declaration.
This changes the public installation contract and uses a feat commit with a
BREAKING CHANGE footer. The guides describe the complete installation and
command patterns; the original decisions remain valid outside dependency
ownership and type resolution.
