import { type Fields, parseJson, readFields } from './json.ts'
import type {
  CheckRun,
  CommandResult,
  GitHub,
  Job,
  ReviewThread,
  RunCommand,
  WorkflowRun
} from './types.ts'

type GhCall = { args: readonly string[]; action: string }

type ThreadsRequest = { number: number; cursor: string | undefined }

type ThreadsPage = { threads: ReviewThread[]; cursor: string | undefined }

const REPOSITORY = 'repos/{owner}/{repo}'
const PAGE_SIZE = 'per_page=100'
const PULL_REQUEST_FIELDS = [
  'number',
  'title',
  'state',
  'isDraft',
  'headRefOid',
  'headRefName',
  'headRepositoryOwner',
  'baseRefName',
  'isCrossRepository',
  'mergeStateStatus',
  'url'
].join(',')
const THREADS_QUERY = `query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          isResolved
          path
          line
          originalLine
          comments(first: 1) { nodes { url author { login } } }
        }
      }
    }
  }
}`

function failureDetail(result: CommandResult): string {
  return (
    result.stderr.trim() ||
    result.stdout.trim() ||
    `exit code ${result.exitCode}`
  )
}

function toThread(node: Fields): ReviewThread {
  const [comment] = node.fields('comments').list('nodes')
  return {
    path: node.string('path'),
    line: node.optionalNumber('line') ?? node.optionalNumber('originalLine'),
    author:
      comment?.optionalFields('author')?.string('login') ?? 'a deleted user',
    url: comment?.optionalString('url')
  }
}

function toCheckRun(check: Fields): CheckRun {
  return {
    id: check.number('id'),
    status: check.string('status'),
    conclusion: check.optionalString('conclusion'),
    suiteId: check.fields('check_suite').number('id'),
    url: check.string('html_url')
  }
}

function toWorkflowRun(run: Fields): WorkflowRun {
  return {
    id: run.number('id'),
    path: run.string('path'),
    event: run.string('event'),
    status: run.string('status'),
    conclusion: run.optionalString('conclusion'),
    headSha: run.string('head_sha'),
    suiteId: run.number('check_suite_id'),
    url: run.string('html_url')
  }
}

function toJob(job: Fields): Job {
  return {
    name: job.string('name'),
    status: job.string('status'),
    conclusion: job.optionalString('conclusion'),
    url: job.string('html_url')
  }
}

export function createGitHub(run: RunCommand): GitHub {
  async function gh({ args, action }: GhCall): Promise<string> {
    const result = await run({ file: 'gh', args })
    if (result.exitCode !== 0) {
      throw new Error(`Could not ${action}: ${failureDetail(result)}`)
    }
    return result.stdout
  }

  async function ghFields(call: GhCall): Promise<Fields> {
    const label = `response to "${call.action}"`
    const text = await gh(call)
    return readFields({ value: parseJson({ text, label }), label })
  }

  async function readThreadsPage({
    number,
    cursor
  }: ThreadsRequest): Promise<ThreadsPage> {
    const response = await ghFields({
      action: `list the review threads of #${number}`,
      args: [
        'api',
        'graphql',
        '-F',
        'owner={owner}',
        '-F',
        'name={repo}',
        '-F',
        `number=${number}`,
        '-f',
        `query=${THREADS_QUERY}`,
        ...(cursor === undefined ? [] : ['-f', `cursor=${cursor}`])
      ]
    })
    const page = response
      .fields('data')
      .fields('repository')
      .fields('pullRequest')
      .fields('reviewThreads')
    const pageInfo = page.fields('pageInfo')
    return {
      threads: page
        .list('nodes')
        .filter(node => !node.boolean('isResolved'))
        .map(node => toThread(node)),
      cursor: pageInfo.boolean('hasNextPage')
        ? pageInfo.string('endCursor')
        : undefined
    }
  }

  return {
    async readPullRequest(number) {
      const pullRequest = await ghFields({
        action: `read pull request #${number}`,
        args: ['pr', 'view', String(number), '--json', PULL_REQUEST_FIELDS]
      })
      return {
        number: pullRequest.number('number'),
        title: pullRequest.string('title'),
        state: pullRequest.string('state'),
        isDraft: pullRequest.boolean('isDraft'),
        headSha: pullRequest.string('headRefOid'),
        headBranch: pullRequest.string('headRefName'),
        headOwner: pullRequest.fields('headRepositoryOwner').string('login'),
        baseBranch: pullRequest.string('baseRefName'),
        isCrossRepository: pullRequest.boolean('isCrossRepository'),
        mergeStateStatus: pullRequest.string('mergeStateStatus'),
        url: pullRequest.string('url')
      }
    },

    async listOpenThreads(number) {
      let page = await readThreadsPage({ number, cursor: undefined })
      const threads = [...page.threads]
      while (page.cursor !== undefined) {
        page = await readThreadsPage({ number, cursor: page.cursor })
        threads.push(...page.threads)
      }
      return threads
    },

    async countBehind({ base, head }) {
      const comparison = await ghFields({
        action: `compare ${head} with ${base}`,
        args: [
          'api',
          `${REPOSITORY}/compare/${base}...${head}`,
          '--jq',
          '{behind_by: .behind_by}'
        ]
      })
      return comparison.number('behind_by')
    },

    async updateBranch({ number, head }) {
      await gh({
        action: `update the branch of #${number}`,
        args: [
          'api',
          `${REPOSITORY}/pulls/${number}/update-branch`,
          '-X',
          'PUT',
          '-f',
          `expected_head_sha=${head}`
        ]
      })
    },

    async listCheckRuns(sha) {
      const response = await ghFields({
        action: `list the CI required checks of ${sha}`,
        args: [
          'api',
          `${REPOSITORY}/commits/${sha}/check-runs?check_name=CI%20required&${PAGE_SIZE}`
        ]
      })
      return response.list('check_runs').map(check => toCheckRun(check))
    },

    async listWorkflowRuns(sha) {
      const response = await ghFields({
        action: `list the workflow runs of ${sha}`,
        args: ['api', `${REPOSITORY}/actions/runs?head_sha=${sha}&${PAGE_SIZE}`]
      })
      return response
        .list('workflow_runs')
        .map(workflowRun => toWorkflowRun(workflowRun))
    },

    async approveRun(id) {
      await gh({
        action: `approve the workflow run ${id}`,
        args: ['api', `${REPOSITORY}/actions/runs/${id}/approve`, '-X', 'POST']
      })
    },

    async merge({ number, sha, title }) {
      const result = await run({
        file: 'gh',
        args: [
          'api',
          `${REPOSITORY}/pulls/${number}/merge`,
          '-X',
          'PUT',
          '-f',
          'merge_method=merge',
          '-f',
          `sha=${sha}`,
          '-f',
          `commit_title=${title}`,
          '-f',
          'commit_message='
        ]
      })
      if (result.exitCode !== 0) {
        return { isMerged: false, message: failureDetail(result) }
      }
      const label = `response to the merge of #${number}`
      const response = readFields({
        value: parseJson({ text: result.stdout, label }),
        label
      })
      return response.boolean('merged')
        ? { isMerged: true, sha: response.string('sha') }
        : {
            isMerged: false,
            message:
              response.optionalString('message') ??
              'GitHub answered merged: false'
          }
    },

    async listJobs(runId) {
      const response = await ghFields({
        action: `list the jobs of the workflow run ${runId}`,
        args: ['api', `${REPOSITORY}/actions/runs/${runId}/jobs?${PAGE_SIZE}`]
      })
      return response.list('jobs').map(job => toJob(job))
    },

    readFile({ path, ref }) {
      return gh({
        action: `read ${path} at ${ref}`,
        args: [
          'api',
          `${REPOSITORY}/contents/${path}?ref=${encodeURIComponent(ref)}`,
          '-H',
          'Accept: application/vnd.github.raw+json'
        ]
      })
    }
  }
}
