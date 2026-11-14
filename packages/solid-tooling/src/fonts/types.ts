export type FontFile = {
  path: string
  weight?: string | number
  style?: 'normal' | 'italic' | 'oblique'
  unicodeRange?: string
  display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional'
  preload?: boolean
}

export type FontFamily = { family: string; files: readonly FontFile[] }

export type FontOptions = {
  root: string
  fonts?: readonly FontFamily[]
  ssr?: boolean
}

export type FontAsset = {
  fileName: string
  source: Uint8Array | string
  type: string
}

export type FontPreload = { href: string; type: string }

export type FontAssets = {
  assets: FontAsset[]
  files: string[]
  stylesheet: string
  preloads: FontPreload[]
}
