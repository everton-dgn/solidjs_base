// Integration with the tooling-owned artifact writer, excluded from the package tarball.
// oxlint-disable-next-line eslint/no-restricted-imports -- This integration fixture intentionally crosses the package boundary.
export { writeServerArtifacts } from '../../../../solid-tooling/src/publication/publicationArtifacts/helpers/writeServerArtifacts/index.ts'
