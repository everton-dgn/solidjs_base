import type { RouteInfo } from '@solidjs/router'

type Match = {
  path: string
  pattern: string
  match: string
  params: Record<string, string>
  info?: RouteInfo
}

export const Router = {
  match(_url: string): Match[] {
    return []
  }
}
