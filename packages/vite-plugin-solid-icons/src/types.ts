export type IconCustomization = {
  collection: string
  name: string
  // The attributes written on the <svg> element; the customizer edits them.
  attributes: Record<string, string>
}

export type IconCustomizer = (
  customization: IconCustomization
) => void | Promise<void>

export type SolidIconsOptions = {
  // Folders of SVG files by collection name, relative to the Vite root.
  collections?: Record<string, string>
  customizeIcon?: IconCustomizer
}
