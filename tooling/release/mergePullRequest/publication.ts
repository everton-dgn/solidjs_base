import {
  findRun,
  isPublished,
  RELEASE_WORKFLOW,
  releasedVersions,
  shortSha
} from './decisions.ts'
import { parseJson, readFields, readManifest } from './json.ts'
import type {
  Manifest,
  PackageVersion,
  RegistryReading,
  Session,
  WorkflowRun
} from './types.ts'
import { describeDuration, readAgain, waitFor } from './wait.ts'

type ManifestRef = { session: Session; ref: string }

type ReleaseRefs = ManifestRef & { previousRef: string }

type MergedRelease = { session: Session; sha: string }

type PackageWait = { session: Session; release: PackageVersion }

const MANIFEST = '.release-please-manifest.json'
const SETTLED_CONCLUSIONS = new Set(['success', 'skipped'])

async function readManifestAt({
  session,
  ref
}: ManifestRef): Promise<Manifest> {
  const label = `${MANIFEST} at ${ref}`
  const text = await session.github.readFile({ path: MANIFEST, ref })
  return readManifest({ value: parseJson({ text, label }), label })
}

async function readReleases({
  session,
  ref,
  previousRef
}: ReleaseRefs): Promise<PackageVersion[]> {
  const [current, previous] = await Promise.all([
    readManifestAt({ session, ref }),
    readManifestAt({ session, ref: previousRef })
  ])
  const versions = releasedVersions({ current, previous })
  if (versions.length === 0) {
    throw new Error(
      `${MANIFEST} has the same versions at ${ref} and ${previousRef}, so the release publishes nothing.`
    )
  }
  return Promise.all(
    versions.map(async ({ path, version }) => {
      const file = `${path}/package.json`
      const label = `${file} at ${ref}`
      const text = await session.github.readFile({ path: file, ref })
      const manifest = readFields({ value: parseJson({ text, label }), label })
      return { name: manifest.string('name'), version }
    })
  )
}

function describeReleases(releases: readonly PackageVersion[]): string {
  return releases.map(({ name, version }) => `${name}@${version}`).join(', ')
}

async function waitForReleaseRun({
  session,
  sha
}: MergedRelease): Promise<WorkflowRun> {
  const { log } = session.environment
  const { checkTimeout } = session.timing
  let hasReported = false
  return waitFor({
    session,
    timeout: checkTimeout,
    describeTimeout: () =>
      `The Release workflow of ${shortSha(sha)} did not finish within ${describeDuration(checkTimeout)}.`,
    attempt: async () => {
      const runs = await session.github.listWorkflowRuns(sha)
      const run = findRun({ runs, path: RELEASE_WORKFLOW, sha })
      if (run && !hasReported) {
        log(`Release workflow: ${run.url}`)
        hasReported = true
      }
      return run?.status === 'completed' ? run : undefined
    }
  })
}

async function waitForPackage({
  session,
  release
}: PackageWait): Promise<RegistryReading> {
  const { registryTimeout } = session.timing
  const spec = `${release.name}@${release.version}`
  let last: RegistryReading | undefined
  return waitFor({
    session,
    timeout: registryTimeout,
    describeTimeout: () => {
      if (last?.version === release.version) {
        return `${spec} is on npm without a provenance statement.`
      }
      const detail = last?.detail ? ` (${last.detail})` : ''
      return `${spec} did not appear on npm within ${describeDuration(registryTimeout)}${detail}.`
    },
    attempt: async () => {
      last = await session.registry.read(release)
      return isPublished({ reading: last, version: release.version })
        ? last
        : undefined
    }
  })
}

export async function describePublication(refs: ReleaseRefs): Promise<void> {
  const releases = await readReleases(refs)
  refs.session.environment.log(
    `Dry run: would wait for the Release workflow of the merge commit and check ${describeReleases(releases)} on npm.`
  )
}

export async function verifyPublication({
  session,
  sha
}: MergedRelease): Promise<void> {
  const { log } = session.environment
  const releases = await readAgain({
    session,
    read: () => readReleases({ session, ref: sha, previousRef: `${sha}^1` })
  })
  log(`Waiting for the Release workflow of ${shortSha(sha)}.`)
  const run = await waitForReleaseRun({ session, sha })
  const jobs = await readAgain({
    session,
    read: () => session.github.listJobs(run.id)
  })
  for (const job of jobs) {
    const result = job.conclusion ?? job.status
    const link = SETTLED_CONCLUSIONS.has(result) ? '' : ` ${job.url}`
    log(`  ${job.name}: ${result}${link}`)
  }
  if (run.conclusion !== 'success') {
    throw new Error(
      `The Release workflow ended as ${run.conclusion ?? run.status}: ${run.url}`
    )
  }
  log(`Checking ${describeReleases(releases)} on npm.`)
  for (const release of releases) {
    const reading = await waitForPackage({ session, release })
    log(
      `${release.name}@${release.version} is on npm, with provenance ${reading.provenance ?? ''}.`
    )
  }
}
