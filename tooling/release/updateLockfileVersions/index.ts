import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  findWorkspace,
  findWorkspacesSection,
  readGeneratedLock,
  readVersion
} from './lockfile.ts'
import type { WorkspacesSection } from './types.ts'
import { describeWorkspace, readWorkspaceVersion } from './workspace.ts'

type UpdateRequest = {
  generated: string
  root: string
  log: (line: string) => void
}

type LineCheck = {
  root: string
  current: readonly string[]
  next: readonly string[]
  section: WorkspacesSection | undefined
  index: number
}

type Change = { workspace: string; from: string; to: string }

type LineResult =
  | { isValid: true; change: Change }
  | { isValid: false; problem: string }

type Refusal = { generated: string; problems: readonly string[] }

const LOCKFILE = 'bun.lock'
// A lock that changes many lines is wrong as a whole; the first lines are
// enough to tell why.
const MAX_LISTED = 20
const HELP = 'docs/releasing.md#when-the-release-lockfile-workflow-fails'

function countLines(text: string): number {
  const pieces = text.split('\n').length
  return text.endsWith('\n') ? pieces - 1 : pieces
}

async function checkLine({
  root,
  current,
  next,
  section,
  index
}: LineCheck): Promise<Change> {
  if (!section || index <= section.start || index >= section.end) {
    throw new Error('changes a line outside the workspaces section')
  }
  const from = readVersion(current[index] ?? '')
  const to = readVersion(next[index] ?? '')
  if (from === undefined || to === undefined) {
    throw new Error('changes a line that is not the "version" of a workspace')
  }
  const workspace = findWorkspace({ lines: current, index })
  if (workspace === undefined) {
    throw new Error('changes a "version" that belongs to no workspace entry')
  }
  const version = await readWorkspaceVersion({ root, workspace })
  if (to !== version) {
    throw new Error(
      `sets the version of ${describeWorkspace(workspace)} to ${to}, but its package.json has ${version}`
    )
  }
  return { workspace, from, to }
}

async function readLine(check: LineCheck): Promise<LineResult> {
  try {
    return { isValid: true, change: await checkLine(check) }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { isValid: false, problem: `line ${check.index + 1}: ${reason}` }
  }
}

function describeRefusal({ generated, problems }: Refusal): string {
  const listed = problems.slice(0, MAX_LISTED).map(problem => `  ${problem}`)
  const left = problems.length - listed.length
  return [
    `${generated} changes more than the workspace versions of ${LOCKFILE}, so nothing was written:`,
    ...listed,
    ...(left > 0 ? [`  and ${left} more line(s)`] : []),
    `Generate it again from this tree, or see ${HELP}.`
  ].join('\n')
}

function describeChange({ workspace, from, to }: Change): string {
  return `${describeWorkspace(workspace)} ${from} -> ${to}`
}

export async function updateLockfileVersions({
  generated,
  root,
  log
}: UpdateRequest): Promise<void> {
  const lockfile = path.join(root, LOCKFILE)
  const [text, currentText] = await Promise.all([
    readGeneratedLock(generated),
    readFile(lockfile, 'utf8')
  ])
  const next = text.split('\n')
  const current = currentText.split('\n')
  if (next.length !== current.length) {
    throw new Error(
      `${generated} has ${countLines(text)} lines and ${LOCKFILE} has ${countLines(currentText)}, so it adds or removes lines instead of changing workspace versions. Nothing was written.`
    )
  }
  const changed = next.flatMap((line, index) =>
    line === current[index] ? [] : [index]
  )
  if (changed.length === 0) {
    log(`${LOCKFILE} already matches the generated lockfile: nothing to write.`)
    return
  }
  const section = findWorkspacesSection(current)
  const results = await Promise.all(
    changed.map(index => readLine({ root, current, next, section, index }))
  )
  const problems = results.flatMap(result =>
    result.isValid ? [] : [result.problem]
  )
  if (problems.length > 0) {
    throw new Error(describeRefusal({ generated, problems }))
  }
  await writeFile(lockfile, text)
  const changes = results.flatMap(result =>
    result.isValid ? [result.change] : []
  )
  log(
    `Wrote ${LOCKFILE} with the version of each workspace from its package.json: ${changes.map(change => describeChange(change)).join(', ')}.`
  )
}
