import process from 'node:process'

import { agents } from '../index.ts'

type AgentsRun = { root: string; shouldCheck: boolean }

export async function runAgents({
  root,
  shouldCheck
}: AgentsRun): Promise<number> {
  const state = await agents({ root, shouldWrite: !shouldCheck })
  if (!shouldCheck || state === 'current') return 0
  process.stderr.write(`AGENTS.md: ${state}\n`)
  return 1
}
