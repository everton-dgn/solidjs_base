import type { ComponentProps, JSX } from '@solidjs/web'

export type IconCustomization = {
  collection: string
  name: string
  // The attributes written on the <svg> element; the customizer edits them.
  attributes: Record<string, string>
}

export type IconCustomizer = (
  customization: IconCustomization
) => void | Promise<void>

// The component of an icon: the props of an <svg> element, spread on it.
export type IconComponent = (props: ComponentProps<'svg'>) => JSX.Element

export type SolidIconsOptions = {
  // Folders of SVG files by collection name, relative to the Vite root.
  collections?: Record<string, string>
  customizeIcon?: IconCustomizer
  // The declarations of the named imports, relative to the Vite root, or
  // false to write none.
  typesFile?: string | false
}
