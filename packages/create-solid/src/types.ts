export type Profile = {
  pm: 'bun' | 'pnpm' | 'npm'
  dir: string
  diagnostics?: boolean
  siteUrl?: string
  shouldInitGit: boolean
  shouldInstall: boolean
}
