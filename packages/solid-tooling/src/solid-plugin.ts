// WHY: Oxlint resolves jsPlugins from the application's config, and Bun's
// isolated linker only exposes the application's direct dependencies there.
// This module resolves the plugin from the package, which depends on it.
export { default } from 'eslint-plugin-solid'
