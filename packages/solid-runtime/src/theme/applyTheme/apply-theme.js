// Plain JavaScript, so storedThemeScript can serialize it from a Node config.
// Document and storedThemeScript serialize this function into a script; keep
// the body self-contained.

/** @typedef {{ theme: 'light' | 'dark', color: string }} AppliedTheme */

/** @param {AppliedTheme} applied */
export function applyTheme({ theme, color }) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.classList.toggle('light', theme === 'light')
  root.style.colorScheme = theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', color)
}
