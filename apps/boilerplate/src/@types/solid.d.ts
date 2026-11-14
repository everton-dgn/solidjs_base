import '@solidjs/web'

declare module '@solidjs/web' {
  interface RequestEventLocals {
    serverFailure?: Error
  }
}
