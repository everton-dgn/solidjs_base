import type { Environment } from '../mergePullRequest/types.ts'

// The sections that an application installs with the package. devDependencies
// stay out: an installation never reads them.
export type DependencyField =
  | 'dependencies'
  | 'optionalDependencies'
  | 'peerDependencies'

export type PinnedPackage = {
  name: string
  version: string
  field: DependencyField
}

export type PackedPackage = {
  name: string
  version: string
  pinned: PinnedPackage[]
}

// Durations in milliseconds.
export type Timing = { interval: number; timeout: number }

export type WaitRequest = {
  tarball: string
  root: string
  timing: Timing
  environment: Environment
}

export type RegistryReading = {
  isPublished: boolean
  detail: string | undefined
}
