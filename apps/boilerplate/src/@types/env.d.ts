import 'vite/client'

declare global {
  interface ImportMetaEnv {
    readonly PUBLICATION_BUILD_ID?: string
  }
}
