import { describeDuration } from '../mergePullRequest/wait.ts'
import {
  DEPENDENCY_FIELDS,
  findPinnedPackages,
  readWorkspaceNames
} from './pinned.ts'
import { readRegistry } from './registry.ts'
import { readPackedManifest } from './tarball.ts'
import type { PinnedPackage, RegistryReading, WaitRequest } from './types.ts'

type Reading = { pinned: PinnedPackage; reading: RegistryReading }

type Timeout = { packed: string; missing: Reading[]; timeout: number }

function describePinned({ name, version }: PinnedPackage): string {
  return `${name}@${version}`
}

function describeMissing(missing: readonly Reading[]): string {
  return missing
    .map(({ pinned, reading }) =>
      (reading.detail ?? describePinned(pinned)).replace(/\.$/u, '')
    )
    .join('; ')
}

function describeTimeout({ packed, missing, timeout }: Timeout): string {
  const versions = missing.map(({ pinned }) => describePinned(pinned))
  return [
    `${versions.join(', ')} did not appear on npm within ${describeDuration(timeout)} (${describeMissing(missing)}).`,
    `${packed} pins ${missing.length === 1 ? 'it' : 'them'} in ${[...new Set(missing.map(({ pinned }) => pinned.field))].join(', ')}, so it was not published: it would install nothing until npm has that version.`,
    `Publish ${versions.join(', ')} first. When its publish job in this run failed, fix the cause, such as a trusted publisher missing on npm, and choose "Re-run failed jobs", which runs this wait again (docs/releasing.md#when-the-publish-job-fails).`
  ].join('\n')
}

// A package may pin the same version in two sections, such as in
// dependencies and in peerDependencies.
function uniqueVersions(pinned: readonly PinnedPackage[]): PinnedPackage[] {
  return [...new Map(pinned.map(item => [describePinned(item), item])).values()]
}

// The reading of a version until its first read, which the time limit can
// leave out when the reads before it took the time.
function notRead(pinned: PinnedPackage): Reading {
  return {
    pinned,
    reading: {
      isPublished: false,
      detail: `${describePinned(pinned)} was not read before the time limit`
    }
  }
}

export async function waitForPinnedPackages({
  tarball,
  root,
  timing,
  environment
}: WaitRequest): Promise<void> {
  const { run, log, sleep, now } = environment
  const [manifest, names] = await Promise.all([
    readPackedManifest(tarball),
    readWorkspaceNames(root)
  ])
  const { name, version, pinned } = findPinnedPackages({ manifest, names })
  const packed = `${name}@${version}`
  if (pinned.length === 0) {
    log(
      `${packed} pins no package of this repository in ${DEPENDENCY_FIELDS.join(', ')}: nothing to wait for.`
    )
    return
  }
  log(
    `${packed} pins ${pinned.map(item => `${describePinned(item)} in ${item.field}`).join(', ')}. Waiting up to ${describeDuration(timing.timeout)} for npm to have them.`
  )
  const deadline = now() + timing.timeout
  const timedOut = (missing: Reading[]): Error =>
    new Error(describeTimeout({ packed, missing, timeout: timing.timeout }))
  let waiting = uniqueVersions(pinned).map(item => notRead(item))
  for (;;) {
    const missing: Reading[] = []
    // WHY: a read that starts at the time limit, or runs past it, would hold
    // the publish job after the wait it announced, once for each version.
    for (const [index, { pinned: item }] of waiting.entries()) {
      const remaining = deadline - now()
      if (remaining <= 0) throw timedOut([...missing, ...waiting.slice(index)])
      const reading = await readRegistry({
        run,
        name: item.name,
        version: item.version,
        timeout: Math.ceil(remaining)
      })
      if (reading.isPublished) {
        log(`${describePinned(item)} is on npm.`)
      } else {
        missing.push({ pinned: item, reading })
      }
    }
    if (missing.length === 0) return
    const remaining = deadline - now()
    if (remaining <= 0) throw timedOut(missing)
    const pause = Math.min(timing.interval, remaining)
    log(
      `  ${describeMissing(missing)}. Reading again in ${describeDuration(pause)}.`
    )
    await sleep(pause)
    waiting = missing
  }
}
