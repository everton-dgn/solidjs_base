import { parseJson, readFields } from './json.ts'
import type { Registry, RegistryReading, RunCommand } from './types.ts'

const PROVENANCE_FIELD = 'dist.attestations.provenance.predicateType'

function firstLine(text: string): string | undefined {
  return text
    .trim()
    .split('\n')
    .find(line => line.length > 0)
}

export function createRegistry(run: RunCommand): Registry {
  return {
    async read({ name, version }) {
      const spec = `${name}@${version}`
      const result = await run({
        file: 'npm',
        args: ['view', spec, 'version', PROVENANCE_FIELD, '--json']
      })
      const missing: RegistryReading = {
        version: undefined,
        provenance: undefined,
        detail: undefined
      }
      if (result.exitCode !== 0) {
        return {
          ...missing,
          detail: result.stderr.includes('E404')
            ? `${spec} is not on the registry yet`
            : firstLine(result.stderr)
        }
      }
      if (!result.stdout.trim()) return missing
      const label = `npm view ${spec}`
      const parsed = parseJson({ text: result.stdout, label })
      // npm prints one object per matching version, in a list.
      const entry = readFields({
        value: Array.isArray(parsed) ? (parsed as unknown[])[0] : parsed,
        label
      })
      return {
        version: entry.optionalString('version'),
        provenance: entry.optionalString(PROVENANCE_FIELD),
        detail: undefined
      }
    }
  }
}
