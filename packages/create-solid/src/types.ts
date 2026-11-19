export type Profile = {
  pm: 'bun' | 'pnpm' | 'npm'
  dir: string
  theme?: boolean
  icons?: boolean
  fonts?: boolean
  diagnostics?: boolean
  siteUrl?: string
  shouldInitGit: boolean
  shouldInstall: boolean
}
