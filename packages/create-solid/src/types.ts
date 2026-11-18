import type * as v from 'valibot'

import type { versions, manifestSchema } from './schema.ts'

export type Versions = v.InferOutput<typeof versions>
export type Manifest = v.InferOutput<typeof manifestSchema>
export type Profile = {
  pm: 'bun' | 'pnpm' | 'npm'
  dir: string
  siteUrl?: string
  shouldInitGit: boolean
  shouldInstall: boolean
}
export type DocumentRewrite = Pick<Profile, 'pm' | 'dir'> & { version: string }
export type PatchRewrite = Pick<Profile, 'pm' | 'dir'>
