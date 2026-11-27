type CheckStatus = 'ok' | 'warning' | 'error'

type PackageEntry = {
  package: string
  version: string
  source: string
  file: string
}

type SkillEntry = { package: string; source: string; path: string }

type Validation = { cwd: string; commands: string[] }

export type Check = {
  id: string
  status: CheckStatus
  // null only when the application manifest itself cannot be read.
  package: string | null
  expected: string
  observed: string
  source: string
  file: string
  fix: string
}

export type Report = {
  root: string
  workspaceRoot: string
  packages: PackageEntry[]
  skills: SkillEntry[]
  checks: Check[]
  validation: Validation
}

export type Preset = {
  isI18nDisabled: boolean
  folders: string[]
  tasks: string[]
}
