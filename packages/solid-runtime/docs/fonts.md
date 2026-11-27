# Optional fonts

[Runtime reference](README.md)

`@evertondgn/solid-runtime/fonts/font-links` exports `FontLinks` under the
`solid` condition. With `fonts` configured in `defineSolidApp`, render it once
inside the SSR Document head, in both client and server trees. It renders an
external stylesheet and anonymous font preloads from the preset's shared URL
data. No inline styles, typography tokens or font binaries belong to the
runtime. Client-only HTML receives links from the preset automatically. Omit the
import and component when fonts are not configured.

See
[application fonts](https://github.com/everton-dgn/solidjs_base/blob/main/packages/solid-tooling/docs/fonts.md)
for the full configuration, SSR and client-only examples, asset behavior and
migration.
