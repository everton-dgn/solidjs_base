import type { ViteUserConfig } from 'vite-plus'

import type { SeoOptions } from '../seo-module.ts'

export type SolidTestOptions = {
  root: string
  language?: string
  seo?: SeoOptions | false
  // WHY: a factory, because each project starts its own Vite server and a
  // plugin instance keeps the state of the server that resolved it last.
  plugins: () => ViteUserConfig['plugins']
  // Packages that export TypeScript source under the solid condition.
  sourcePackages?: string[]
  // URL where the dom project starts. The default follows the application.
  domUrl?: string
  // Locale of the browser in the browser project.
  locale?: string
}

// What the application chooses. defineSolidApp supplies root, plugins and the
// language, which it takes as an option of its own.
export type SolidTestSettings = Omit<
  SolidTestOptions,
  'root' | 'plugins' | 'language' | 'seo'
>
