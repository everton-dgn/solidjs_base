// Bound total catalog bytes: Paraglide loads every locale at once, so memory
// grows with the complete set. See docs/tooling/limits.md.
export const CATALOGS_MAX_BYTES = 8_388_608
