import { baseLocale, setLocale } from '@paraglide/runtime.js'
import { beforeEach } from 'vite-plus/test'

// WHY: browser tests share cookies between files, so each test starts again
// from the base locale.
// oxlint-disable-next-line vitest/require-top-level-describe -- A setup file registers the hook for every test file.
beforeEach(() => setLocale(baseLocale, { reload: false }))
