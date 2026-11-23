import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { readFileSync } from 'node:fs'
import process from 'node:process'

type Groups = { group: number; foreground: number }
type PsAnswer = Pick<SpawnSyncReturns<string>, 'stdout' | 'error'>

const groupField = 2
const foregroundField = 5
// WHY: The query runs inside a signal listener. ps took at most 21 ms under a load average of 40, and one that hangs must not freeze Ctrl+Z.
const psTimeoutMs = 250
function known({ group, foreground }: Groups): Groups | undefined {
  const isKnown =
    Number.isInteger(group) &&
    Number.isInteger(foreground) &&
    group > 0 &&
    foreground > 0
  return isKnown ? { group, foreground } : undefined
}
function readStat(): string | undefined {
  try {
    return readFileSync('/proc/self/stat', 'utf8')
  } catch {
    return undefined
  }
}

export function statGroups(stat: string): Groups | undefined {
  // WHY: The command name comes second, in parentheses, and may hold spaces and parentheses of its own. The fields after it start at the state.
  const fields = stat
    .slice(stat.lastIndexOf(')') + 1)
    .trim()
    .split(' ')
    .map(Number)
  return known({
    group: fields[groupField] ?? 0,
    foreground: fields[foregroundField] ?? 0
  })
}
export function psGroups({ stdout, error }: PsAnswer): Groups | undefined {
  if (error) return undefined
  const [foreground = 0, group = 0] = stdout.trim().split(/\s+/u).map(Number)
  return known({ group, foreground })
}
// WHY: Node does not expose the foreground process group of the terminal, so the system answers: /proc on Linux and ps elsewhere.
export function ownsTerminal(): boolean {
  const stat = readStat()
  const groups =
    stat === undefined
      ? psGroups(
          spawnSync(
            '/bin/ps',
            ['-o', 'tpgid=,pgid=', '-p', String(process.pid)],
            {
              encoding: 'utf8',
              stdio: ['ignore', 'pipe', 'ignore'],
              timeout: psTimeoutMs
            }
          )
        )
      : statGroups(stat)
  // WHY: With no answer the CLI writes as it did before it could ask. A launcher that shares the group stops at once, and its shell may take the terminal between this answer and a write, so the terminal is owned only by a CLI that leads its group, which the shell waits for.
  return (
    groups === undefined ||
    (groups.group === process.pid && groups.group === groups.foreground)
  )
}
