/// <reference types="@evertondgn/vite-plugin-solid-icons/icon-modules" />

// WHY: the declarations that the icons plugin writes in src/ import this entry
// of the plugin, which an application only reaches through this package when
// its install is isolated. An unresolved import would turn every icon into any
// without an error, because of skipLibCheck. The type comes from the declaration
// of the imports by path, so it stays the one of the installed plugin.
declare module '@evertondgn/vite-plugin-solid-icons/types' {
  import type Icon from 'icon:solid-tooling/icon'

  export type IconComponent = typeof Icon
}
