# 0032. The preset loads application-owned fonts

- Status: Accepted
- Date: 2026-11-14

## Context

The boilerplate manually declared two Inter font faces and imported its Latin
subset again for a Document preload. Derived applications would repeat the
loading mechanism and could preload a URL different from the CSS asset. The
production CSP permits external stylesheets but blocks inline styles.

## Decision

Add an optional, data-only `fonts` array to the shared `defineSolidApp` options.
Families specify files relative to the application root, weight, style, Unicode
range, display and preload. Display defaults to `swap`. The application owns the
bytes, licenses and typography tokens.

The tooling plugin emits content-hashed font files and one external CSS asset.
It deduplicates identical bytes and derives CSS URLs and preloads from the same
asset list. Direct asset emission prevents base64 inlining of small fonts. Both
build environments share the resolved asset snapshot; only the client emits
files. The supported base is a same-origin absolute pathname.

The runtime's separate `fonts/font-links` entry renders stylesheet and preload
links in the SSR document. Client-only applications receive the links through
`transformIndexHtml` and need no runtime import. No font plugin, module or asset
is generated when `fonts` is absent or empty. The existing external stylesheet
CSP stays unchanged.

## Consequences

The boilerplate moves its font descriptors to `fonts.ts`, retains its two Inter
binaries and all typography tokens, and replaces the handwritten preload with
`FontLinks`. Adoption requires removing the old declarations and preload
imports, otherwise the application could emit duplicate assets. Generated
filenames change, with identical font bytes and face descriptors.

Client-only and SSR plain installed scenarios generate an original 448-byte CC0
test font. Both Bun linkers check single emission, external CSS and exact
preload URL equality. SSR i18n retains the no-font scenario and rejects font
modules in every bundle inventory. The matrix count and time budgets remain
unchanged. Separate mutations prove rejection of a wrong preload URL, an inline
font face and an unexpected runtime font import. Full browser rendering and CSP
remain covered by the boilerplate's E2E gates.

No package dependency is added. The generated fixture bytes are versioned in the
test helper, so tests need no font generator or network font download.
