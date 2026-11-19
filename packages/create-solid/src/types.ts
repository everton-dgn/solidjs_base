export type Profile = {
  pm: 'bun' | 'pnpm' | 'npm'
  dir: string
  mode?: 'server' | 'static' | 'client'
  seo?: boolean
  theme?: boolean
  icons?: boolean
  fonts?: boolean
  diagnostics?: boolean
  siteUrl?: string
  shouldInitGit: boolean
  shouldInstall: boolean
}
