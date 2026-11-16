import { parseJson } from '../mergePullRequest/json.ts'
import { TIMED_OUT_EXIT_CODE } from '../mergePullRequest/runner.ts'
import type { RunCommand } from '../mergePullRequest/types.ts'
import type { RegistryReading } from './types.ts'

type VersionQuery = {
  run: RunCommand
  name: string
  version: string
  timeout: number
}

function firstLine(text: string): string | undefined {
  return text
    .trim()
    .split('\n')
    .find(line => line.length > 0)
}

// npm prints one version as a string or in a list, depending on its release
// and on how many versions match.
function readVersions(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  if (typeof value === 'object' && value !== null && 'version' in value) {
    return readVersions(value.version)
  }
  return []
}

// WHY: npm keeps the metadata of a package in a local cache, and a read served
// from it would not see a version published after the first read.
// --prefer-online makes npm ask the registry every time.
export async function readRegistry({
  run,
  name,
  version,
  timeout
}: VersionQuery): Promise<RegistryReading> {
  const spec = `${name}@${version}`
  const result = await run({
    file: 'npm',
    args: ['view', spec, 'version', '--json', '--prefer-online'],
    isWrite: false,
    timeout
  })
  if (result.exitCode !== 0) {
    const isMissing = `${result.stdout}\n${result.stderr}`.includes('E404')
    return {
      isPublished: false,
      isStopped: result.exitCode === TIMED_OUT_EXIT_CODE,
      detail: isMissing
        ? `${spec} is not on npm yet`
        : (firstLine(result.stderr) ??
          `npm view ${spec} exited with code ${result.exitCode}`)
    }
  }
  const label = `npm view ${spec}`
  let versions: string[]
  try {
    versions = result.stdout.trim()
      ? readVersions(parseJson({ text: result.stdout, label }))
      : []
  } catch (error) {
    return {
      isPublished: false,
      isStopped: false,
      detail: error instanceof Error ? error.message : String(error)
    }
  }
  return versions.includes(version)
    ? { isPublished: true, isStopped: false, detail: undefined }
    : {
        isPublished: false,
        isStopped: false,
        detail: `${label} printed ${JSON.stringify(versions)}, not ${version}`
      }
}
