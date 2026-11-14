import '@solidjs/web'

declare module '@solidjs/web' {
  interface RequestEventLocals {
    localizedPageBase?: string
  }
}

export type LocalizeRequestOptions = {
  request: Request
  next: () => Promise<Response>
}
