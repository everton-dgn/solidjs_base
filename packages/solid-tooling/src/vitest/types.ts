import type { ViteUserConfig } from 'vite-plus'

export type SolidTestOptions = {
  root: string
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

// What the application chooses. defineSolidApp supplies root and plugins.
export type SolidTestSettings = Omit<SolidTestOptions, 'root' | 'plugins'>
