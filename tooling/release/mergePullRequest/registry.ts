import { parseJson, readFields } from './json.ts'
import type { Registry, RegistryReading, RunCommand } from './types.ts'

type RegistryEntry = { value: unknown; label: string }

const PROVENANCE_FIELD = 'dist.attestations.provenance.predicateType'

function firstLine(text: string): string | undefined {
  return text
    .trim()
    .split('\n')
    .find(line => line.length > 0)
}

// npm prints one entry per matching version, in a list. An entry is an object
// with both fields, or only the version string when the provenance is missing.
function toReading({ value, label }: RegistryEntry): RegistryReading {
  const entry: unknown = Array.isArray(value) ? (value as unknown[])[0] : value
  if (typeof entry === 'string') {
    return { version: entry, provenance: undefined, detail: undefined }
  }
  const fields = readFields({ value: entry, label })
  return {
    version: fields.optionalString('version'),
    provenance: fields.optionalString(PROVENANCE_FIELD),
    detail: undefined
  }
}

export function createRegistry(run: RunCommand): Registry {
  return {
    async read({ name, version }) {
      const spec = `${name}@${version}`
      const result = await run({
        file: 'npm',
        args: ['view', spec, 'version', PROVENANCE_FIELD, '--json'],
        isWrite: false
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
      return toReading({
        value: parseJson({ text: result.stdout, label }),
        label
      })
    }
  }
}
