import inventory from '../../packages/create-solid/tooling/scenarios.json' with { type: 'json' }

const COMPARE_LIMIT = 300
type Classification = {
  docs: boolean
  app: boolean
  packages: boolean
  generator: boolean
  consistency: boolean
  expected: Record<string, string[]>
}

function selectSuites({
  files,
  shouldRunAll
}: {
  files: ChangedFile[]
  shouldRunAll: boolean
}) {
  let shouldCheckDocs = shouldRunAll
  let shouldCheckApp = shouldRunAll
  let shouldCheckPackages = shouldRunAll
  let shouldCheckGenerator = shouldRunAll
  for (const file of files) {
    // The README can link any file that disappears.
    if (['removed', 'renamed'].includes(file.status)) shouldCheckDocs = true
    // A rename affects the suites for both the old and new paths.
    for (const path of [file.filename, file.previous_filename]) {
      if (!path) continue
      if (
        path.startsWith('packages/create-solid/') &&
        path !== 'packages/create-solid/package.json'
      ) {
        shouldCheckDocs = true
        shouldCheckGenerator = true
      } else if (path.startsWith('apps/boilerplate/')) {
        shouldCheckApp = true
        shouldCheckGenerator = true
        shouldCheckDocs ||= path.endsWith('.md')
        // The root package.json registers the app's patches.
        shouldCheckPackages ||=
          path.startsWith('apps/boilerplate/patches/') ||
          path === 'apps/boilerplate/package.json'
      } else if (/^packages\/[^/]+\/(?:docs|skills)\//u.test(path)) {
        shouldCheckPackages = true
        shouldCheckGenerator = true
        shouldCheckDocs = true
      } else if (
        path.endsWith('.md') ||
        path.startsWith('docs/') ||
        path.startsWith('.github/ISSUE_TEMPLATE/') ||
        path === 'LICENSE' ||
        path === '.coderabbit.yaml'
      ) {
        shouldCheckDocs = true
      } else {
        shouldCheckPackages = true
        shouldCheckApp = true
        shouldCheckGenerator = true
        shouldCheckDocs = true
      }
    }
  }
  return {
    shouldCheckDocs,
    shouldCheckApp,
    shouldCheckGenerator,
    shouldCheckPackages
  }
}
export const PR_LIMIT = 3000
export const scenarioJobs = inventory.map(
  ({ name }) => `Generated app (${name})`
)
export type ChangedFile = {
  filename: string
  previous_filename?: string
  status: string
}
export function classify({
  event,
  files = [],
  branch = '',
  isForced = false,
  isChecked = false,
  count = 0
}: {
  event: string
  files?: ChangedFile[]
  branch?: string
  isForced?: boolean
  isChecked?: boolean
  count?: number
}): Classification {
  const isPush = event === 'push'
  // The compare API lists at most 300 files and the pull request API at most 3,000.
  const shouldRunAll =
    (!isPush && event !== 'pull_request') ||
    branch.startsWith('release-please--') ||
    isForced ||
    Math.max(files.length, count) >= (isPush ? COMPARE_LIMIT : PR_LIMIT)
  const {
    shouldCheckDocs,
    shouldCheckApp,
    shouldCheckGenerator,
    shouldCheckPackages
  } = selectSuites({ files, shouldRunAll })
  const consistency = !isChecked || shouldRunAll
  return {
    docs: shouldCheckDocs,
    packages: shouldCheckPackages,
    app: shouldCheckApp,
    generator: shouldCheckGenerator,
    consistency,
    expected: {
      changes: ['Changes'],
      'merge-message': isPush ? ['Merge commit body'] : [],
      'app-e2e': shouldCheckApp ? ['Boilerplate app E2E'] : [],
      scenario: shouldCheckGenerator ? scenarioJobs : [],
      docs: shouldCheckDocs ? ['Docs'] : [],
      packages: shouldCheckPackages ? ['Packages'] : [],
      app: shouldCheckApp ? ['Boilerplate app'] : [],
      generator: shouldCheckGenerator ? ['Generator'] : [],
      consistency: consistency ? ['Consistency'] : []
    }
  }
}
