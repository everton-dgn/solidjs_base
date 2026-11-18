# 0041. Publish prerendered SSR as static files

- Status: Accepted
- Date: 2026-11-18

## Context

The publication middleware converts rendered HTML into Markdown and derives the
sitemap and editorial indexes during prerendering. Applications need those files
on hosts that only read from disk.

## Decision

SSR applications can select `output: 'static'`. The default remains `vercel`.
Nitro renders the filesystem page routes and each configured locale prefix
during the build. Every unprefixed page serves the base locale, preserving
incoming links. The client compiler uses URL and base locale in that order. One
root catch-all, including one inside a route group, supplies `/404.html`. Nested
catch-alls still need an enumeration contract. Visitors choose another language
through links. A CDN does not negotiate the language from cookies or request
headers.

The existing publication hooks verify the files before deployment. Use static
sitemap and Markdown publication, configure the robots route and select the
editorial indexes the application publishes. Parameterized pages and sitemap
inventories with array or partitioned sources require an enumeration contract
beyond this target.

The build runs application middleware for rendering. It disables request nonces
and registers the render error observer that the Markdown converter requires.
Render HTML with `createRenderOptions()`. The build reads the complete response
and rejects failed or incomplete rendering, even with HTTP status 200. HTML with
a nonce fails the build. Static publication refuses dynamic Markdown opt-ins.

The build writes `.output/csp-hashes.json` beside the public directory. Its
`pages` object maps each HTML filename (for example `/about/index.html`) to
SHA-256 source expressions without quotes. The sorted `union` contains each hash
once. Deploy the matching hashes with every HTML release. Use the
[static hosting policy](../../packages/solid-tooling/docs/app-config.md#static-output)
for the entry module, inline scripts and response headers.

## Consequences

Publish the contents of `.output/public` on a host that serves directory
indexes. No Node function handles requests. Server functions, mutation handlers,
application `serverSetup` and the backend invocation contract of
`protectServerOperation` require a running server. Deployment route rules and
security headers belong to the host. Request-time Markdown negotiation is
unavailable. Link directly to the published Markdown files.

Select the localStorage theme storage from [ADR 0036](0036-no-server-mode.md). A
prebuilt page has the same initial HTML for all visitors and cannot read their
theme cookies.
