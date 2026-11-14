// Integration with the application-owned artifact writer, excluded from the package tarball.
// oxlint-disable-next-line eslint/no-restricted-imports -- This integration fixture intentionally crosses the package boundary.
export { writeServerArtifacts } from '../../../../../apps/boilerplate/tooling/publicationArtifacts/helpers/writeServerArtifacts/index.ts'
