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
request, so a package change that breaks the application fails before it
becomes a version.
[ADR 0009](../../docs/ADRs/0009-boilerplate-app-in-the-monorepo.md) explains why
the copy exists.

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

The code, `AGENTS.md` and the guides in `docs/` are in Portuguese, as in the
original. Their sections about releases, CI, Git hooks and the Vercel deploy
describe the original repository.
