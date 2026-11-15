import { CI_WORKFLOW, RELEASE_WORKFLOW } from '../decisions.ts'
import type {
  Command,
  CommandResult,
  Environment,
  MergeRequest,
  RunCommand
} from '../types.ts'

type Sequences<Item> = Record<string, Item[][]>

type FakeCommand = { github: FakeGitHub; command: Command }

type FakeEndpoint = FakeCommand & { path: string; method: string }

type Harness = {
  request: MergeRequest
  calls: Command[]
  lines: string[]
}

type HarnessOptions = {
  github: FakeGitHub
  isDryRun?: boolean
  expectedSha?: string
}

type ContentsRequest = { github: FakeGitHub; file: string; ref: string }

type ArgLookup = { command: Command; name: string }

type RouteMatch = FakeCommand & { groups: Record<string, string> }

type PagedList = FakeCommand & { key: string; items: readonly unknown[] }

type Route = {
  pattern: RegExp
  method: string
  respond: (match: RouteMatch) => CommandResult
}

const REPOSITORY_PREFIX = 'repos/{owner}/{repo}/'
const RUN_URL = 'https://github.com/everton-dgn/solidjs_base/actions/runs'
const TIMING = { interval: 1000, checkTimeout: 60_000, registryTimeout: 10_000 }

function json(value: unknown): CommandResult {
  return { exitCode: 0, stdout: JSON.stringify(value), stderr: '' }
}

function failure(stderr: string): CommandResult {
  return { exitCode: 1, stdout: '', stderr }
}

const counters = new WeakMap<object, number>()

// Each call takes the next response of the list and repeats the last one, so a
// test describes how a check or a run changes between two reads.
function nextOf<Item>(sequence: readonly Item[] | undefined): Item | undefined {
  if (!sequence || sequence.length === 0) return undefined
  const index = counters.get(sequence) ?? 0
  counters.set(sequence, index + 1)
  return sequence[Math.min(index, sequence.length - 1)]
}

function flag({ command, name }: ArgLookup): string {
  const index = command.args.indexOf(name)
  return index === -1 ? '' : (command.args[index + 1] ?? '')
}

function field({ command, name }: ArgLookup): string {
  const prefix = `${name}=`
  const value = command.args.find(arg => arg.startsWith(prefix))
  return value === undefined ? '' : value.slice(prefix.length)
}

function pullRequestJson(pullRequest: FakePullRequest): unknown {
  return {
    number: pullRequest.number,
    title: pullRequest.title,
    state: pullRequest.state,
    isDraft: pullRequest.isDraft,
    headRefOid: pullRequest.headSha,
    headRefName: pullRequest.headBranch,
    headRepositoryOwner: { login: pullRequest.headOwner },
    baseRefName: pullRequest.baseBranch,
    isCrossRepository: pullRequest.isCrossRepository,
    mergeStateStatus: pullRequest.mergeStateStatus,
    mergeCommit:
      pullRequest.mergeSha === undefined ? null : { oid: pullRequest.mergeSha },
    url: `https://github.com/everton-dgn/solidjs_base/pull/${pullRequest.number}`
  }
}

function threadsJson({ github, command }: FakeCommand): unknown {
  const cursor = field({ command, name: 'cursor' })
  const index = cursor ? Number(cursor.replace('page-', '')) : 0
  const page = github.threadPages[index] ?? []
  const hasNextPage = index + 1 < github.threadPages.length
  return {
    data: {
      repository: {
        pullRequest: {
          reviewThreads: {
            pageInfo: {
              hasNextPage,
              endCursor: hasNextPage ? `page-${index + 1}` : null
            },
            nodes: page.map(thread => ({
              isResolved: thread.isResolved,
              path: thread.path,
              line: thread.line,
              originalLine: thread.originalLine,
              comments: {
                nodes: [
                  {
                    url: `https://github.com/everton-dgn/solidjs_base/pull/7#${thread.path}`,
                    author:
                      thread.author === null ? null : { login: thread.author }
                  }
                ]
              }
            }))
          }
        }
      }
    }
  }
}

function checkRunJson(check: FakeCheckRun): unknown {
  return {
    id: check.id,
    name: 'CI required',
    status: check.status,
    conclusion: check.conclusion,
    html_url: `${RUN_URL}/${check.suiteId}/job/${check.id}`,
    check_suite: { id: check.suiteId }
  }
}

function workflowRunJson(run: FakeWorkflowRun): unknown {
  return {
    id: run.id,
    name: run.path === CI_WORKFLOW ? 'CI' : 'Release',
    path: run.path,
    event: run.event,
    status: run.status,
    conclusion: run.conclusion,
    head_sha: run.headSha,
    check_suite_id: run.suiteId,
    html_url: `${RUN_URL}/${run.id}`
  }
}

// Without --paginate and --slurp, gh prints only the first page, as an object.
function paged({ github, command, key, items }: PagedList): CommandResult {
  const pages: unknown[] = []
  for (let start = 0; start === 0 || start < items.length;) {
    const page = items.slice(start, start + github.pageSize)
    pages.push({ total_count: items.length, [key]: page })
    start += github.pageSize
  }
  const isPaginated =
    command.args.includes('--paginate') && command.args.includes('--slurp')
  return json(isPaginated ? pages : pages[0])
}

function contents({ github, file, ref }: ContentsRequest): CommandResult {
  const text = github.files[`${decodeURIComponent(ref)}:${file}`]
  return text === undefined
    ? failure('gh: Not Found (HTTP 404)')
    : { exitCode: 0, stdout: text, stderr: '' }
}

const ROUTES: readonly Route[] = [
  {
    pattern: /^compare\/[^.]+\.\.\.\w+$/u,
    method: 'GET',
    respond: ({ github }) =>
      json({
        behind_by: github.behindBy,
        base_sha: github.baseSha,
        merge_base_sha: github.mergeBaseSha
      })
  },
  {
    pattern: /^git\/trees\/(?<sha>\w+)\?recursive=1$/u,
    method: 'GET',
    respond: ({ github, groups }) => {
      const tree = github.trees[groups.sha ?? '']
      return tree === undefined
        ? failure('gh: Not Found (HTTP 404)')
        : json({
            truncated: tree.truncated,
            tree: Object.entries(tree.files).map(([path, file]) => ({
              path,
              mode: file.mode,
              sha: file.sha
            }))
          })
    }
  },
  {
    pattern: /^commits\/(?<sha>\w+)$/u,
    method: 'GET',
    respond: ({ github, groups }) =>
      json({
        parents: (github.parents[groups.sha ?? ''] ?? []).map(sha => ({ sha }))
      })
  },
  {
    pattern: /^pulls\/\d+\/update-branch$/u,
    method: 'PUT',
    respond: ({ github }) => {
      github.pullRequest.headSha = github.updatedHead
      github.behindBy = 0
      return json({ message: 'Updating pull request branch.' })
    }
  },
  {
    pattern: /^commits\/(?<sha>\w+)\/check-runs\?/u,
    method: 'GET',
    respond: ({ github, command, groups }) =>
      paged({
        github,
        command,
        key: 'check_runs',
        items: (nextOf(github.checkRuns[groups.sha ?? '']) ?? []).map(check =>
          checkRunJson(check)
        )
      })
  },
  {
    pattern: /^actions\/runs\?head_sha=(?<sha>\w+)&/u,
    method: 'GET',
    respond: ({ github, command, groups }) =>
      paged({
        github,
        command,
        key: 'workflow_runs',
        items: (nextOf(github.workflowRuns[groups.sha ?? '']) ?? []).map(run =>
          workflowRunJson(run)
        )
      })
  },
  {
    pattern: /^actions\/runs\/\d+\/approve$/u,
    method: 'POST',
    respond: () => ({ exitCode: 0, stdout: '', stderr: '' })
  },
  {
    pattern: /^pulls\/\d+\/merge$/u,
    method: 'PUT',
    respond: ({ github }) => github.mergeResult
  },
  {
    pattern: /^actions\/runs\/(?<id>\d+)\/jobs\?/u,
    method: 'GET',
    respond: ({ github, command, groups }) =>
      paged({
        github,
        command,
        key: 'jobs',
        items: (github.jobs[groups.id ?? ''] ?? []).map(job => ({
          name: job.name,
          status: job.status,
          conclusion: job.conclusion,
          html_url: `${RUN_URL}/${groups.id ?? ''}/job/1`
        }))
      })
  },
  {
    pattern: /^contents\/(?<file>[^?]+)\?ref=(?<ref>.+)$/u,
    method: 'GET',
    respond: ({ github, groups }) =>
      contents({ github, file: groups.file ?? '', ref: groups.ref ?? '' })
  }
]

function respondToEndpoint({
  github,
  command,
  path,
  method
}: FakeEndpoint): CommandResult | undefined {
  for (const route of ROUTES) {
    const match = route.pattern.exec(path)
    if (match && route.method === method) {
      return route.respond({ github, command, groups: { ...match.groups } })
    }
  }
  return undefined
}

// A test lists the failures the next calls to an endpoint get, before the
// responses of the fake.
function takeFailure({
  github,
  command
}: FakeCommand): CommandResult | undefined {
  const endpoint = command.args[1] ?? ''
  const part = Object.keys(github.failures).find(key => endpoint.includes(key))
  return part === undefined ? undefined : github.failures[part]?.shift()
}

function respond({ github, command }: FakeCommand): CommandResult | undefined {
  const injected = takeFailure({ github, command })
  if (injected) return injected
  const [first, second] = command.args
  if (command.file === 'npm') {
    return first === 'view'
      ? (nextOf(github.registry[second ?? '']) ??
          failure('npm error code E404'))
      : undefined
  }
  if (first === 'pr' && second === 'view') {
    return json(pullRequestJson(github.pullRequest))
  }
  if (first !== 'api' || second === undefined) return undefined
  if (second === 'graphql') return json(threadsJson({ github, command }))
  if (!second.startsWith(REPOSITORY_PREFIX)) return undefined
  return respondToEndpoint({
    github,
    command,
    path: second.slice(REPOSITORY_PREFIX.length),
    method: flag({ command, name: '-X' }) || 'GET'
  })
}

// Files by path, each one a regular file with the blob given.
function fakeTree(blobs: Record<string, string>): FakeTree {
  return {
    truncated: false,
    files: Object.fromEntries(
      Object.entries(blobs).map(([path, sha]) => [
        path,
        { mode: '100644', sha }
      ])
    )
  }
}

export type FakePullRequest = {
  number: number
  title: string
  state: string
  isDraft: boolean
  headSha: string
  headBranch: string
  headOwner: string
  baseBranch: string
  isCrossRepository: boolean
  mergeStateStatus: string
  mergeSha: string | undefined
}

export type FakeThread = {
  isResolved: boolean
  path: string
  line: number | null
  originalLine: number | null
  author: string | null
}

export type FakeCheckRun = {
  id: number
  status: string
  conclusion: string | null
  suiteId: number
}

export type FakeWorkflowRun = {
  id: number
  path: string
  event: string
  status: string
  conclusion: string | null
  headSha: string
  suiteId: number
}

export type FakeJob = { name: string; status: string; conclusion: string }

export type FakeFile = { mode: string; sha: string }

export type FakeTree = { truncated: boolean; files: Record<string, FakeFile> }

export type FakeGitHub = {
  pullRequest: FakePullRequest
  threadPages: FakeThread[][]
  behindBy: number
  baseSha: string
  mergeBaseSha: string
  trees: Record<string, FakeTree>
  updatedHead: string
  parents: Record<string, string[]>
  checkRuns: Sequences<FakeCheckRun>
  workflowRuns: Sequences<FakeWorkflowRun>
  mergeResult: CommandResult
  jobs: Record<string, FakeJob[]>
  files: Record<string, string>
  registry: Record<string, CommandResult[]>
  pageSize: number
  failures: Record<string, CommandResult[]>
}

export const HEAD = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
export const UPDATED_HEAD = 'f0e1d2c3b4a5968778695a4b3c2d1e0f98765432'
export const MERGE_SHA = '0123456789abcdef0123456789abcdef01234567'
export const OTHER_SHA = '9999999999999999999999999999999999999999'
export const BASE_SHA = 'b0b1b2b3b4b5b6b7b8b9c0c1c2c3c4c5c6c7c8c9'
export const MERGE_BASE_SHA = 'c0c1c2c3c4c5c6c7c8c9d0d1d2d3d4d5d6d7d8d9'
export const PROVENANCE = 'https://slsa.dev/provenance/v1'

export function checkRun(check: Partial<FakeCheckRun>): FakeCheckRun {
  return {
    id: 100,
    status: 'completed',
    conclusion: 'success',
    suiteId: 9001,
    ...check
  }
}

export function workflowRun(run: Partial<FakeWorkflowRun>): FakeWorkflowRun {
  return {
    id: 501,
    path: CI_WORKFLOW,
    event: 'pull_request',
    status: 'completed',
    conclusion: 'success',
    headSha: HEAD,
    suiteId: 9001,
    ...run
  }
}

export function registryEntry(version: string): CommandResult {
  return json([
    {
      version,
      'dist.attestations.provenance.predicateType': PROVENANCE
    }
  ])
}

export function featureGitHub(): FakeGitHub {
  return {
    pullRequest: {
      number: 7,
      title: 'feat(tooling): add a rule',
      state: 'OPEN',
      isDraft: false,
      headSha: HEAD,
      headBranch: 'feat/a-rule',
      headOwner: 'everton-dgn',
      baseBranch: 'main',
      isCrossRepository: false,
      mergeStateStatus: 'CLEAN',
      mergeSha: undefined
    },
    threadPages: [[]],
    behindBy: 0,
    baseSha: BASE_SHA,
    mergeBaseSha: MERGE_BASE_SHA,
    // The branch changed src/rule.ts, added src/new.ts and removed
    // docs/guide.md; the base changed README.md and removed docs/old.md.
    trees: {
      [MERGE_BASE_SHA]: fakeTree({
        'README.md': 'readme-1',
        'docs/guide.md': 'guide-1',
        'docs/old.md': 'old-1',
        'src/rule.ts': 'rule-1'
      }),
      [HEAD]: fakeTree({
        'README.md': 'readme-1',
        'docs/old.md': 'old-1',
        'src/new.ts': 'new-1',
        'src/rule.ts': 'rule-2'
      }),
      [BASE_SHA]: fakeTree({
        'README.md': 'readme-2',
        'docs/guide.md': 'guide-1',
        'src/rule.ts': 'rule-1'
      }),
      [UPDATED_HEAD]: fakeTree({
        'README.md': 'readme-2',
        'src/new.ts': 'new-1',
        'src/rule.ts': 'rule-2'
      })
    },
    updatedHead: UPDATED_HEAD,
    parents: { [UPDATED_HEAD]: [HEAD, BASE_SHA] },
    checkRuns: { [HEAD]: [[checkRun({})]] },
    workflowRuns: { [HEAD]: [[workflowRun({})]] },
    mergeResult: json({
      sha: MERGE_SHA,
      merged: true,
      message: 'Pull Request successfully merged'
    }),
    jobs: {},
    files: {},
    registry: {},
    pageSize: 100,
    failures: {}
  }
}

export function releaseGitHub(): FakeGitHub {
  const github = featureGitHub()
  return {
    ...github,
    pullRequest: {
      ...github.pullRequest,
      number: 42,
      title: 'chore: release main',
      headBranch: 'release-please--branches--main'
    },
    workflowRuns: {
      ...github.workflowRuns,
      [MERGE_SHA]: [
        [],
        [
          workflowRun({
            id: 700,
            path: RELEASE_WORKFLOW,
            event: 'push',
            status: 'in_progress',
            conclusion: null,
            headSha: MERGE_SHA,
            suiteId: 7000
          })
        ],
        [
          workflowRun({
            id: 700,
            path: RELEASE_WORKFLOW,
            event: 'push',
            headSha: MERGE_SHA,
            suiteId: 7000
          })
        ]
      ]
    },
    jobs: {
      700: [
        {
          name: 'Release PRs and tags',
          status: 'completed',
          conclusion: 'success'
        },
        {
          name: 'Publish packages/solid-tooling',
          status: 'completed',
          conclusion: 'success'
        },
        {
          name: 'Publish packages/solid-runtime',
          status: 'completed',
          conclusion: 'success'
        }
      ]
    },
    files: {
      [`${HEAD}:.release-please-manifest.json`]: JSON.stringify({
        'packages/solid-tooling': '0.7.0',
        'packages/solid-runtime': '0.7.0'
      }),
      'main:.release-please-manifest.json': JSON.stringify({
        'packages/solid-tooling': '0.6.0',
        'packages/solid-runtime': '0.6.0'
      }),
      [`${MERGE_SHA}:.release-please-manifest.json`]: JSON.stringify({
        'packages/solid-tooling': '0.7.0',
        'packages/solid-runtime': '0.7.0'
      }),
      [`${MERGE_SHA}^1:.release-please-manifest.json`]: JSON.stringify({
        'packages/solid-tooling': '0.6.0',
        'packages/solid-runtime': '0.6.0'
      }),
      [`${HEAD}:packages/solid-tooling/package.json`]: JSON.stringify({
        name: '@evertondgn/solid-tooling'
      }),
      [`${HEAD}:packages/solid-runtime/package.json`]: JSON.stringify({
        name: '@evertondgn/solid-runtime'
      }),
      [`${MERGE_SHA}:packages/solid-tooling/package.json`]: JSON.stringify({
        name: '@evertondgn/solid-tooling'
      }),
      [`${MERGE_SHA}:packages/solid-runtime/package.json`]: JSON.stringify({
        name: '@evertondgn/solid-runtime'
      })
    },
    registry: {
      '@evertondgn/solid-tooling@0.7.0': [
        failure(
          'npm error code E404\nnpm error 404 No match found for version 0.7.0'
        ),
        registryEntry('0.7.0')
      ],
      '@evertondgn/solid-runtime@0.7.0': [registryEntry('0.7.0')]
    }
  }
}

export function failedCommand(stderr: string): CommandResult {
  return failure(stderr)
}

export function jsonResult(value: unknown): CommandResult {
  return json(value)
}

export function createHarness({
  github,
  isDryRun = false,
  expectedSha = github.pullRequest.headSha
}: HarnessOptions): Harness {
  const calls: Command[] = []
  const lines: string[] = []
  let clock = 0
  const run: RunCommand = command => {
    calls.push(command)
    const method = flag({ command, name: '-X' })
    if (command.isWrite !== (method !== '' && method !== 'GET')) {
      return Promise.reject(
        new Error(
          `Command marked with isWrite ${String(command.isWrite)} and the method ${method || 'GET'}: ${command.args.join(' ')}`
        )
      )
    }
    const result = respond({ github, command })
    if (result === undefined) {
      return Promise.reject(
        new Error(
          `Unexpected command: ${command.file} ${command.args.join(' ')}`
        )
      )
    }
    return Promise.resolve(result)
  }
  const environment: Environment = {
    run,
    log: line => {
      lines.push(line)
    },
    sleep: milliseconds => {
      clock += milliseconds
      return Promise.resolve()
    },
    now: () => clock
  }
  return {
    calls,
    lines,
    request: {
      number: github.pullRequest.number,
      expectedSha,
      isDryRun,
      timing: TIMING,
      environment
    }
  }
}

export function endpoints(calls: readonly Command[]): string[] {
  return calls.map(({ file, args: [first, second] }) =>
    [file, first, second].join(' ').replace(REPOSITORY_PREFIX, '')
  )
}

export function writes(calls: readonly Command[]): Command[] {
  return calls.filter(call => {
    const index = call.args.indexOf('-X')
    return index !== -1 && call.args[index + 1] !== 'GET'
  })
}
