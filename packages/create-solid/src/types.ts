type Replacement = readonly [
  pattern: string | RegExp,
  replacement: string,
  shouldApply?: boolean
]
type ApplyEdits = (text: string, edits: readonly Replacement[]) => string

export type Profile = {
  pm: 'bun' | 'pnpm' | 'npm'
  dir: string
  mode?: 'server' | 'static' | 'client'
  hasSeo?: boolean
  hasTheme?: boolean
  hasIcons?: boolean
  hasFonts?: boolean
  hasDiagnostics?: boolean
  siteUrl?: string
  shouldInitGit: boolean
  shouldInstall: boolean
}

export type Versions = Record<string, string>
export type GenerationContext = {
  profile: Profile
  pkg: {
    name: string
    description?: string
    packageManager?: string
    dependencies: Versions
    devDependencies: Versions
    scripts: Versions
    overrides?: Versions
    patchedDependencies?: Versions
  }
  settings: {
    bunVersion: string
    catalog: Versions
    versions: Versions
    overrides: Versions
    patches: Versions
    bunfig: string
    lefthook: string
  }
  write: (output: FileWrite) => void
}

export type FileWrite = { file: string; content: string }

export type StagedContext = GenerationContext & { stage: string }

export type EditFile = (
  file: string,
  transform: (text: string, apply: ApplyEdits) => string
) => void
