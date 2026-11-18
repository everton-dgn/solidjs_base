export type Profile = {
  pm: 'bun' | 'pnpm' | 'npm'
  dir: string
  siteUrl?: string
  shouldInitGit: boolean
  shouldInstall: boolean
}
