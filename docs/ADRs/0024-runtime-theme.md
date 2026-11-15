# 0024. Theme logic is an explicit runtime feature

- Status: Accepted
- Date: 2026-11-14

## Context

Applications need ready-to-use light, dark and system preferences without
shipping theme code when the feature is unused. Cookie names and palette values
belong to each application.

## Decision

Each theme module has a separate kebab-case export under `theme/`, without a
barrel, preset option or virtual module. One `defineTheme` call validates and
copies cookieName, cookieMaxAge, colors and defaultTheme. It returns bound
createTheme, readTheme, themeColor and themeScript functions, plus defaultTheme
and themes. Low-level modules accept explicit options where needed.

The script serializes the self-contained applyTheme function and escapes
less-than characters in configured strings. The application owns its script
element and nonce, its Provider and context, its switcher and its CSS palette.
SSR emits only light or dark classes for explicit preferences, never inline
styles.

## Consequences

The runtime runs the moved tests in node and dom projects. Only development
dependencies are added. The installed ssr-i18n scenario checks the script nonce
against CSP and the dark cookie against the class and meta color. Applications
without theme reject theme module IDs in every audited bundle. Negative probes
exercise the import, missing nonce and wrong expected color assertions.

The application continues to supply `solid-js`; this extraction does not change
peerDependencies or move dependency ownership. Knip's strict production pass has
a scoped `solid-js!` exception for that existing consumer dependency. Installed
builds exercise resolution with both Bun linkers. Test support under
`src/tests/` is excluded from the published tarball and coverage.
