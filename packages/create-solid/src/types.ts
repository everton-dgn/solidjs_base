import * as v from 'valibot'

const versions = v.record(v.string(), v.string())
export const manifestSchema = v.looseObject({
  name: v.string(),
  version: v.string(),
  description: v.optional(v.string()),
  scripts: v.optional(versions, {}),
  dependencies: v.optional(versions, {}),
  devDependencies: v.optional(versions, {}),
  overrides: v.optional(versions),
  packageManager: v.optional(v.string()),
  patchedDependencies: v.optional(versions),
  catalog: v.optional(versions)
})
export const settingsSchema = v.object({
  catalog: versions,
  versions,
  overrides: versions,
  patches: versions,
  bunfig: v.string(),
  lefthook: v.string()
})
export type Versions = v.InferOutput<typeof versions>
export type Manifest = v.InferOutput<typeof manifestSchema>
