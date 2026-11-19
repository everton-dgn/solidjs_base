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
