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
during the build. The unprefixed root serves the base locale. Visitors choose
another language through links. A CDN does not negotiate the language from
cookies or request headers.

The existing publication hooks verify the files before deployment. Use static
sitemap and Markdown publication, configure the robots route and select the
editorial indexes the application publishes. Parameterized pages and sitemap
inventories with array or partitioned sources require an enumeration contract
beyond this target.

The build runs application middleware for rendering. It disables request nonces
and registers the render error observer that the Markdown converter requires.
HTML with a nonce fails the build. The host configures security headers and a
CSP compatible with the emitted scripts, including hashes for allowed inline
scripts. Recalculate hashes when deploying changed HTML.

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
