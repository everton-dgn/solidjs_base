import type { Manifest } from './types.ts'

type JsonRecord = Record<string, unknown>

type JsonSource = { value: unknown; label: string }

type JsonText = { text: string; label: string }

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export type Fields = {
  string: (key: string) => string
  optionalString: (key: string) => string | undefined
  number: (key: string) => number
  optionalNumber: (key: string) => number | undefined
  boolean: (key: string) => boolean
  fields: (key: string) => Fields
  optionalFields: (key: string) => Fields | undefined
  list: (key: string) => Fields[]
}

export function parseJson({ text, label }: JsonText): unknown {
  try {
    const value: unknown = JSON.parse(text)
    return value
  } catch (error) {
    throw new Error(`${label} is not valid JSON.`, { cause: error })
  }
}

export function readFields({ value, label }: JsonSource): Fields {
  if (!isRecord(value)) {
    throw new TypeError(`Unexpected ${label}: expected a JSON object.`)
  }
  const mismatch = (problem: string): never => {
    throw new TypeError(`Unexpected ${label}: ${problem}.`)
  }
  const optional = (key: string): unknown => value[key] ?? undefined
  const fields: Fields = {
    string: key => fields.optionalString(key) ?? mismatch(`${key} is missing`),
    optionalString: key => {
      const field = optional(key)
      if (field === undefined || typeof field === 'string') return field
      return mismatch(`${key} is not a string`)
    },
    number: key => fields.optionalNumber(key) ?? mismatch(`${key} is missing`),
    optionalNumber: key => {
      const field = optional(key)
      if (field === undefined || typeof field === 'number') return field
      return mismatch(`${key} is not a number`)
    },
    boolean: key => {
      const field = optional(key)
      return typeof field === 'boolean'
        ? field
        : mismatch(`${key} is not a boolean`)
    },
    fields: key =>
      fields.optionalFields(key) ?? mismatch(`${key} is not an object`),
    optionalFields: key => {
      const field = optional(key)
      return field === undefined
        ? undefined
        : readFields({ value: field, label: `${label}.${key}` })
    },
    list: key => {
      const field = optional(key)
      if (!Array.isArray(field)) return mismatch(`${key} is not a list`)
      return field.map((item: unknown, index) =>
        readFields({ value: item, label: `${label}.${key}[${index}]` })
      )
    }
  }
  return fields
}

export function readManifest({ value, label }: JsonSource): Manifest {
  if (!isRecord(value)) {
    throw new TypeError(`Unexpected ${label}: expected a JSON object.`)
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, field]) => {
      if (typeof field !== 'string') {
        throw new TypeError(`Unexpected ${label}: ${key} is not a string.`)
      }
      return [key, field]
    })
  )
}
