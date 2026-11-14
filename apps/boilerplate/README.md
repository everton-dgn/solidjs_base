# boilerplate (copy)

A copy of
[boilerplate_solidjs](https://github.com/everton-dgn/boilerplate_solidjs) at
commit `6145493`, used to test the packages of this repository in a complete
application. It is never published or deployed.

It takes its lint preset, lint rules, formatter settings, TypeScript configs,
Vitest projects, Playwright config, Knip and Stylelint configs and the Vite and
Nitro config (`defineSolidApp`) from `@evertondgn/solid-tooling`, through the
workspace, in place of the copies the original keeps in `tooling/`,
`vite.config.ts` and `tsconfig.json`. The CI runs its full suites on every pull
request, so a package change that breaks the application fails before it becomes
a version. [ADR 0009](../../docs/ADRs/0009-boilerplate-app-in-the-monorepo.md)
explains why the copy exists.

The package supplies tools that this copy does not import itself. The copy keeps
its Solid libraries, Vite+, Paraglide and message-format, application libraries,
and direct imports of Nitro, filesystem-routing and Playwright Test. Its
`playwright`, `knip` and `tsc` tasks resolve executables from the tooling
package. The inherited tsconfig reads package-owned type references, so no
application declaration of `@types/node` or TypeScript is needed.

`env.ts` spreads the runtime package's `serverEnv` validators for `HOST`, `PORT`
and `BASE_URL_TEST`. This copy keeps its own `VITE_SITE_URL` schema and its
direct Valibot dependency. Environment behavior and `ImportMetaEnv` declarations
stay the same. The runtime is in `dependencies`; the tooling remains in
`devDependencies`, including with Knip's strict production check. See
[environment and preview](docs/development.md#environment-and-preview).

## Running it

From the repository root:

```bash
vp install
vp run build
```

Then, from this folder:

```bash
vp run dev
vp run check:ci
vp run test
vp run test:e2e
```

The [development guide](../../docs/development.md#the-boilerplate-app) lists
every command, what changed from the original and how to update the copy.

`AGENTS.md` and the guides in `docs/` are in English. The code comments and the
test titles are in Portuguese, as in the original. The sections of the guides
about releases, CI, Git hooks and the Vercel deploy describe the original
repository.
