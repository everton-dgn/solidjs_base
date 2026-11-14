import type { redirect, ResponseHelperInit } from '@solidjs/web'

declare module '@solidjs/web' {
  interface RequestEventLocals {
    localizedPageBase?: string
  }
}

export type LocalizeRequestOptions = {
  request: Request
  next: () => Promise<Response>
}

export type LocalizedRedirectOptions = ResponseHelperInit & {
  href: Parameters<typeof redirect>[0]
  locale?: string
  shouldLocalize?: boolean
}
