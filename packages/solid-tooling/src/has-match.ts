import { glob } from 'node:fs/promises'

type PatternQuery = { root: string; pattern: string }

export async function hasMatch({
  root,
  pattern
}: PatternQuery): Promise<boolean> {
  const matches = glob(pattern, { cwd: root })
  const { done } = await matches.next()
  await matches.return?.()
  return !done
}
