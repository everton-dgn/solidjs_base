# 0025. Locale navigation and tags belong to the runtime

- Status: Accepted
- Date: 2026-11-14

## Context

Navigation still imported the application's generated Paraglide runtime, and
locale tags required an exhaustive pt/en/es map. Applications without
translations must be able to use the runtime without adding locale setup.

## Decision

Move createLocalizedNavigate, createLocaleNavigationGuard and
installLocaleHistoryGuard into separate kebab-case exports under runtime i18n/.
They use i18n/locale, without direct Paraglide imports or a barrel. Extend that
seam with setLocale in both preset providers and its ambient declarations. The
single-language implementation is a no-op, preserving language and URL.

The independent locale-tag entry uses Intl.Locale, defaults to the provider's
current locale and accepts optional exact-key tag overrides. It does not infer a
region or enumerate supported locales. Malformed tags throw RangeError. The copy
keeps its pt-BR/en-US/es-ES overrides, LocalizedLink and locale switcher. The
helper's consumers use the configured locale list for JSON-LD languages.

## Verification and consequences

All 10 navigation cases and their assertions move into the runtime. DOM and
real-browser history tests use its generated de/fr/ja project. The package adds
only development dependencies for those tests; peer dependencies and application
dependency ownership stay unchanged.

The client-only installed fixture navigates without prefixes and checks tags and
the no-op setter. Both Bun linkers run, with an additional isolated zh-Hant-TW
language case. The ssr-i18n smoke checks fr-FR and de-DE in HTML. Negative
probes add a real translation dependency to the moved navigation module, change
the expected HTML tag and remove the single-language setter. The disabled-i18n
bundle audit still rejects Paraglide and Inlang.

The complete copy suites cover application behavior, including both E2E modes.
The installed matrix proves installation and DOM navigation, not desktop
packaging or browser hydration; the runtime browser tests and copy E2E cover
their own navigation boundaries. This extends ADRs 0021, 0022 and 0023.
