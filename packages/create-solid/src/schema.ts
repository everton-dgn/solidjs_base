import * as v from 'valibot'

export const versions = v.record(v.string(), v.string())
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
  version: v.string(),
  catalog: versions,
  versions,
  overrides: versions,
  patches: versions,
  bunVersion: v.string(),
  bunfig: v.string(),
  lefthook: v.string()
})
