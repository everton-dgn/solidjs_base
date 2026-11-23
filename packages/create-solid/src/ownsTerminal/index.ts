import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import process from 'node:process'

type Groups = { group: number; foreground: number }

const groupField = 2
const foregroundField = 5
function procGroups(): Groups | undefined {
  try {
    const stat = readFileSync('/proc/self/stat', 'utf8')
    // WHY: The command name comes second, in parentheses, and may hold spaces and parentheses of its own. The fields after it start at the state.
    const fields = stat
      .slice(stat.lastIndexOf(')') + 1)
      .trim()
      .split(' ')
      .map(Number)
    return {
      group: fields[groupField] ?? 0,
      foreground: fields[foregroundField] ?? 0
    }
  } catch {
    return undefined
  }
}
function psGroups(): Groups {
  const { stdout, error } = spawnSync(
    'ps',
    ['-o', 'tpgid=,pgid=', '-p', String(process.pid)],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  )
  const [foreground = 0, group = 0] = error
    ? []
    : stdout.trim().split(/\s+/u).map(Number)
  return { group, foreground }
}

// WHY: Node does not expose the foreground process group of the terminal, so the system answers: /proc on Linux and ps elsewhere.
export function ownsTerminal(): boolean {
  const { group, foreground } = procGroups() ?? psGroups()
  const hasAnswer =
    Number.isInteger(group) &&
    Number.isInteger(foreground) &&
    group > 0 &&
    foreground > 0
  // WHY: With no answer the CLI writes as it did before it could ask.
  return !hasAnswer || group === foreground
}
