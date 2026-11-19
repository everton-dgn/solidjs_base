export type Profile = {
  pm: 'bun' | 'pnpm' | 'npm'
  dir: string
  icons?: boolean
  fonts?: boolean
  diagnostics?: boolean
  siteUrl?: string
  shouldInitGit: boolean
  shouldInstall: boolean
}
