import { setLocale } from '../../src/i18n/locale/index.ts'

// Browser files share cookies; restore the document locale before each test.
// oxlint-disable-next-line vitest/require-top-level-describe -- This setup applies to every browser test.
beforeEach(() => setLocale('fr', { reload: false }))
