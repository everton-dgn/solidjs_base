export type Command = { file: 'gh' | 'npm'; args: readonly string[] }

export type CommandResult = { exitCode: number; stdout: string; stderr: string }

export type RunCommand = (command: Command) => Promise<CommandResult>

export type Environment = {
  run: RunCommand
  log: (line: string) => void
  sleep: (milliseconds: number) => Promise<void>
  now: () => number
}

// Durations in milliseconds.
export type Timing = {
  interval: number
  checkTimeout: number
  registryTimeout: number
}

export type MergeRequest = {
  number: number
  expectedSha: string | undefined
  isDryRun: boolean
  timing: Timing
  environment: Environment
}

export type PullRequest = {
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
  url: string
}

export type ReviewThread = {
  path: string
  line: number | undefined
  author: string
  url: string | undefined
}

export type CheckRun = {
  id: number
  status: string
  conclusion: string | undefined
  suiteId: number
  url: string
}

export type WorkflowRun = {
  id: number
  path: string
  event: string
  status: string
  conclusion: string | undefined
  headSha: string
  suiteId: number
  url: string
}

export type Job = {
  name: string
  status: string
  conclusion: string | undefined
  url: string
}

export type CompareRange = { base: string; head: string }

export type Comparison = { behindBy: number; baseSha: string }

export type BranchUpdate = { number: number; head: string }

export type MergeCall = { number: number; sha: string; title: string }

export type MergeOutcome =
  | { isMerged: true; sha: string }
  | { isMerged: false; message: string }

export type FileAtRef = { path: string; ref: string }

export type GitHub = {
  readPullRequest: (number: number) => Promise<PullRequest>
  listOpenThreads: (number: number) => Promise<ReviewThread[]>
  compare: (range: CompareRange) => Promise<Comparison>
  updateBranch: (update: BranchUpdate) => Promise<void>
  readParents: (sha: string) => Promise<string[]>
  listCheckRuns: (sha: string) => Promise<CheckRun[]>
  listWorkflowRuns: (sha: string) => Promise<WorkflowRun[]>
  approveRun: (id: number) => Promise<void>
  merge: (call: MergeCall) => Promise<MergeOutcome>
  listJobs: (runId: number) => Promise<Job[]>
  readFile: (file: FileAtRef) => Promise<string>
}

export type PackageVersion = { name: string; version: string }

export type RegistryReading = {
  version: string | undefined
  provenance: string | undefined
  detail: string | undefined
}

export type Registry = {
  read: (spec: PackageVersion) => Promise<RegistryReading>
}

export type Session = {
  github: GitHub
  registry: Registry
  timing: Timing
  environment: Environment
}

export type CheckDecision =
  | { kind: 'passed'; check: CheckRun }
  | { kind: 'failed'; check: CheckRun }
  | { kind: 'pending'; check: CheckRun }
  | { kind: 'approve'; runs: WorkflowRun[] }
  | { kind: 'held'; runs: WorkflowRun[] }
  | { kind: 'missing' }

export type IgnoredCheck = { check: CheckRun; event: string }

export type Manifest = Record<string, string>
