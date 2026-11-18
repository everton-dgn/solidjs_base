import { describeDuration } from '../mergePullRequest/wait.ts'
import {
  DEPENDENCY_FIELDS,
  findPinnedPackages,
  findTemplatePins,
  readWorkspaceNames
} from './pinned.ts'
import { readRegistry } from './registry.ts'
import { readPackedManifest } from './tarball.ts'
import type { PinnedPackage, RegistryReading, WaitRequest } from './types.ts'

// detail: what the last read of the version found. answer: what npm answered
// at the last read it finished.
type Reading = {
  pinned: PinnedPackage
  detail: string
  answer: string | undefined
}

type NextReading = { previous: Reading; reading: RegistryReading }

type Timeout = { packed: string; missing: Reading[]; timeout: number }

// WHY: a timer can fire a few milliseconds late, so a pause that leaves less
// than this before the time limit could end in no read, after a log line that
// announced one.
const MINIMUM_READ_TIME = 1000

function describePinned({ name, version }: PinnedPackage): string {
  return `${name}@${version}`
}

function withoutPeriod(text: string): string {
  return text.replace(/\.$/u, '')
}

function describeMissing(missing: readonly Reading[]): string {
  return missing.map(({ detail }) => withoutPeriod(detail)).join('; ')
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
    detail: `${describePinned(pinned)} was not read before the time limit`,
    answer: undefined
  }
}

// WHY: a read that the runner stopped, as at the time limit of the wait, has
// no answer of npm, and its stop alone would hide what npm answered at the
// read before it.
function nextReading({ previous, reading }: NextReading): Reading {
  const { pinned, answer } = previous
  const detail = reading.detail ?? describePinned(pinned)
  if (!reading.isStopped) return { pinned, detail, answer: detail }
  return {
    pinned,
    detail: answer ? `${withoutPeriod(answer)}, then ${detail}` : detail,
    answer
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
  if (name === '@evertondgn/create-solid') {
    const settings = await readPackedManifest(
      tarball,
      'package/dist/settings.json'
    )
    pinned.push(...findTemplatePins({ manifest: settings, names }))
  }
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
    for (const [index, previous] of waiting.entries()) {
      const item = previous.pinned
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
        missing.push(nextReading({ previous, reading }))
      }
    }
    if (missing.length === 0) return
    // WHY: a pause that reaches the time limit would end in no read, after a
    // log line that announced one.
    if (deadline - now() <= timing.interval + MINIMUM_READ_TIME) {
      throw timedOut(missing)
    }
    log(
      `  ${describeMissing(missing)}. Reading again in ${describeDuration(timing.interval)}.`
    )
    await sleep(timing.interval)
    waiting = missing
  }
}
