import { applyTheme } from '../applyTheme/apply-theme.js'

// Plain JavaScript also loads from an installed package in a Node config.
// WHY: repeats THEMES and DARK_MEDIA_QUERY of constants.ts, which Node cannot
// load from node_modules; a test compares the two.
const THEMES = ['light', 'dark', 'system']
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'
/** @type {readonly ('light' | 'dark')[]} */
const RESOLVED_THEMES = ['light', 'dark']
// WHY: at the start of <head> the script runs before the parser reaches the
// theme-color meta, so it applies the same theme again once the meta exists.
// The first readystatechange ends the parsing, before the modules run, so the
// observer never overrides the application. A script that runs after the
// parsing would never see that event, so it watches nothing.
const THEME_COLOR_SELECTOR = 'meta[name="theme-color"]'

/**
 * @typedef {{
 *   storageKey: string,
 *   colors: Record<'light' | 'dark', string>,
 *   defaultTheme: 'light' | 'dark' | 'system'
 * }} StoredThemeOptions
 */

/** @param {unknown} value */
function serialize(value) {
  return JSON.stringify(value).replaceAll('<', String.raw`\u003c`)
}

/**
 * @param {StoredThemeOptions} options
 * @returns {string}
 */
export function storedThemeScript({ storageKey, colors, defaultTheme }) {
  if (typeof storageKey !== 'string' || !storageKey) {
    throw new Error('storageKey must be a nonempty string')
  }
  if (!THEMES.includes(defaultTheme)) {
    throw new Error('defaultTheme must be light, dark or system')
  }
  for (const key of RESOLVED_THEMES) {
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- Validate untyped callers at the public boundary.
    if (typeof colors?.[key] !== 'string' || !colors[key].trim()) {
      throw new Error(`colors.${key} must be a nonempty color`)
    }
  }
  return `(() => {
  let theme = ${serialize(defaultTheme)};
  try {
    const stored = localStorage.getItem(${serialize(storageKey)});
    if (${serialize(THEMES)}.includes(stored)) theme = stored;
  } catch {}
  const dark = theme === 'dark' || (theme === 'system' && matchMedia(${serialize(DARK_MEDIA_QUERY)}).matches);
  const apply = ${applyTheme.toString()};
  const applied = { theme: dark ? 'dark' : 'light', color: dark ? ${serialize(colors.dark)} : ${serialize(colors.light)} };
  apply(applied);
  const selector = ${serialize(THEME_COLOR_SELECTOR)};
  if (document.readyState !== 'loading' || document.querySelector(selector)) return;
  const observer = new MutationObserver(() => {
    if (!document.querySelector(selector)) return;
    observer.disconnect();
    apply(applied);
  });
  observer.observe(document.head, { childList: true });
  document.addEventListener('readystatechange', () => observer.disconnect(), { once: true });
})();
`
}
