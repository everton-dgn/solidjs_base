# 0023. Locale requests belong to the runtime

- Status: Accepted
- Date: 2026-11-14

## Decision

Extend ADR 0022 with virtual:solid-app/locale-request. The preset serves it from
the application's generated runtime and server modules. Its resolved ID is
provider-neutral. Without project.inlang/settings.json each function throws an
actionable error. The public declarations use string locales.

The runtime exports createLocalizeRequest with an injected applySecurityHeaders
and keeps persistence internal. A separate localized-redirect export preserves
Solid response controls and resolves relative URLs against the validated page
base, declared by the runtime. Entries remain independent, without a barrel.
Applications without i18n do not import them.

## Verification boundaries

Runtime tests generate real Paraglide code for de/fr/ja in an ignored folder.
Moved tests retain their cases and assertions, with locale substitutions. The
application chain and Markdown consumers construct the step with their existing
security configuration. The copy retains navigation, messages and generation.

The installed ssr-i18n scenario uses four real message catalogs and checks
redirects, German content, headers and cookies with both Bun linkers. Negative
probes change the expected redirect, remove the step or import it without an
i18n project. Peer dependency ownership remains unchanged.
