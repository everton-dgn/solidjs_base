# 0006. The workflow publishes through npm trusted publishing

- Status: Accepted
- Date: 2026-11-12

## Context

The npm account requires two-factor authentication. Publishing by hand needs a
passkey confirmation in the browser for each version, within five minutes of the
command. When logging in, npm warned that tokens that bypass two-factor
authentication are being restricted for direct publishing.

npm trusted publishing lets a GitHub Actions workflow publish through OpenID
Connect, with short-lived credentials and no token stored in the repository. It
needs npm 11.5.1 or later, and npm attaches provenance on its own when both the
repository and the package are public.

## Decision

The publish job in `.github/workflows/release.yml` publishes with `npm publish`
through a trusted publisher configured on npmjs.com for `release.yml`. The job
has `id-token: write`, checks the npm version first, and does not restore a
dependency cache, as the npm documentation recommends for release builds. The
package is packed with `vp pm pack`, which resolves `catalog:` and `workspace:`
versions, and the tarball goes to `npm publish`.

## Consequences

- No npm token exists in the repository or in its secrets.
- Each version on npm has a provenance statement that points to the workflow
  run.
- A trusted publisher can only be created for a package that already exists, so
  the first version of each package is published by hand.
- A new trusted publisher expires if the workflow does not publish with it
  within two days, so it is created only when a release is ready.
- The publish job builds the commit that started the run, which is what lets a
  failed version be published again after a fix outside the package folder. The
  steps are in [Releasing](../releasing.md#publishing-a-failed-version-again).
