/// <reference types="@evertondgn/vite-plugin-solid-icons/icon-modules" />

// WHY: the declarations that the icons plugin writes in src/ import this entry
// of the plugin, which an application only reaches through this package when
// its install is isolated. An unresolved import would turn every icon into any
// without an error, because of skipLibCheck. The export inside the declaration
// resolves from this package, which depends on the plugin, so the entry keeps
// every type of the installed plugin.
declare module '@evertondgn/vite-plugin-solid-icons/types' {
  export type {
    IconComponent,
    IconCustomization,
    IconCustomizer,
    SolidIconsOptions
  } from '@evertondgn/vite-plugin-solid-icons'
}
