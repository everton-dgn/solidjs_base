import '@solidjs/web'

type SsrRenderState = {
  readonly hasErrors: boolean | undefined
  readonly hasCompleted: boolean
}

declare module '@solidjs/web' {
  interface RequestEventLocals {
    ssrRenderState?: SsrRenderState
    serverFailure?: Error
  }
}
