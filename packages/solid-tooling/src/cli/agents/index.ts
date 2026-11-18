import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const BLOCK = [
  '<!--SOLID BASE START-->',
  'This application uses the Solid Base packages. Before changing code, run `vp run doctor`.',
  'If the Vite config fails to load, run `node node_modules/@evertondgn/solid-tooling/dist/cli.mjs doctor --root .`.',
  'The report lists installed versions, skills to read, missing dependencies and validation commands.',
  '<!--SOLID BASE END-->'
]

async function readInstructions(file: string): Promise<string> {
  try {
    const bytes = await readFile(file)
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      bytes
    )
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return ''
    }
    throw error
  }
}
function nextFence({ line, fence }: { line: string; fence: string }): string {
  const delimiter = /^ {0,3}(?<run>`{3,}|~{3,})(?<rest>.*)$/u.exec(line)?.groups
  if (!delimiter) return fence
  const { run = '', rest = '' } = delimiter
  if (!fence) return run
  return run.startsWith(fence) && !rest.trim() ? '' : fence
}
function markers({ original, file }: { original: string; file: string }) {
  const lines = original.match(/[^\n]*\n|[^\n]+$/gu) ?? []
  const pairs = new Map<string, { start: number; end: number }>()
  let active = ''
  let fence = ''
  let offset = 0
  for (const [index, raw] of lines.entries()) {
    const line = raw.replace(/\r?\n$/u, '')
    fence = nextFence({ line, fence })
    const marker =
      /<!--(?<kind>SOLID BASE|VITE PLUS) (?<edge>START|END)-->/u.exec(line)
    if (
      !marker &&
      /<!--\s*(?:SOLID BASE|VITE PLUS)\s+(?:START|END)\b/iu.test(line)
    ) {
      throw new Error(`${file}:${index + 1}: malformed marker`)
    }
    if (marker) {
      const [, kind = '', edge] = marker
      const invalid =
        Boolean(fence) ||
        marker[0] !== line ||
        (edge === 'START'
          ? Boolean(active) || pairs.has(kind)
          : active !== kind)
      if (invalid) {
        throw new Error(`${file}:${index + 1}: invalid ${kind} marker`)
      }
      if (edge === 'START') {
        active = kind
        pairs.set(kind, { start: offset, end: offset })
      } else {
        const pair = pairs.get(kind)
        if (pair) pair.end = offset + line.length
        active = ''
      }
    }
    offset += raw.length
  }
  if (active) {
    throw new Error(
      `${file}:${original.slice(0, pairs.get(active)?.start).split('\n').length}: missing ${active} end marker`
    )
  }
  return pairs
}
export async function agents({
  root,
  write
}: {
  root: string
  write: boolean
}): Promise<string> {
  const file = path.join(root, 'AGENTS.md')
  const original = await readInstructions(file)
  const pairs = markers({ original, file })
  const eol = original.includes('\r\n') ? '\r\n' : '\n'
  const block = BLOCK.join(eol)
  const solid = pairs.get('SOLID BASE')
  const vite = pairs.get('VITE PLUS')
  const at = solid?.start ?? vite?.end ?? 0
  let replacement = block
  if (!solid) replacement = vite ? eol + block : block + eol
  const updated =
    original.slice(0, at) + replacement + original.slice(solid?.end ?? at)
  if (write && updated !== original) await writeFile(file, updated)
  if (updated === original) return 'current'
  return solid ? 'outdated' : 'missing'
}
