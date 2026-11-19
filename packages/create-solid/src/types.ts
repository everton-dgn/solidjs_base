export type Profile = {
  pm: 'bun' | 'pnpm' | 'npm'
  dir: string
  fonts?: boolean
  diagnostics?: boolean
  siteUrl?: string
  shouldInitGit: boolean
  shouldInstall: boolean
}
