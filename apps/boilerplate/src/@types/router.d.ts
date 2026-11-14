import '@solidjs/router'
import type { LlmsRouteInfo } from './llms.ts'

declare module '@solidjs/router' {
  interface RouteInfo {
    // `true` gera o Markdown no build; `'dynamic'` converte a cada requisição.
    markdown?: boolean | 'dynamic'
    llms?: LlmsRouteInfo
  }
}
