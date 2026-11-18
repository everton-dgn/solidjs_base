# Optional environment validation

[Runtime reference](README.md)

| Entry   | Exports                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------- |
| `./env` | `serverEnv`: optional `HOST`, `PORT` and `BASE_URL_TEST` schemas, as JavaScript with declarations |

An SSR application can add the `env.ts` shown in
[Environment values checked at startup](../README.md#environment-values-checked-at-startup).
All three keys are optional; `PORT` converts decimal digits to an integer from 0
through 65535. Spread the fragment into the plugin's `server` map and add
application keys to `server` or `client`. With nothing to validate, leave the
file out. The separate SEO option validates `VITE_SITE_URL` only when enabled or
when the origin entry is imported.

The entry is plain JavaScript with a handwritten declaration, without the
`solid` condition. It loads in Node and Vite's module runner and enters the
server bundle when `virtual:solid-env/server` is imported. Contract tests bind
the declaration to the runtime outputs. The runtime supplies Valibot; only an
application that imports Valibot itself needs a direct dependency. The tooling
stays in `devDependencies`, outside production-only installations. Env
validation adds neither the fragment nor Valibot to the client bundle. See the
[environment guide](https://github.com/everton-dgn/solidjs_base/blob/main/packages/solid-tooling/docs/app-config.md#optional-environment-validation)
for extension examples, boot validation and type generation.
