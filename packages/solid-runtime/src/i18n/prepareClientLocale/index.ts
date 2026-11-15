import { installLocaleHistoryGuard } from '../installLocaleHistoryGuard/index.ts'
import { extractLocaleFromUrl } from '../locale/index.ts'

type ClientLocaleOptions = { reload?: () => void }
type ClientLocale = { shouldHydrate: boolean; dispose: () => void }

export function prepareClientLocale({
  reload = () => globalThis.location.reload()
}: ClientLocaleOptions = {}): ClientLocale {
  const [navigation] = performance.getEntriesByType('navigation')
  const loadedLocale = navigation
    ? extractLocaleFromUrl(navigation.name)
    : undefined
  const locale = extractLocaleFromUrl(globalThis.location.href)
  // History may cross locales while the entry bundle is still loading.
  if (
    loadedLocale !== undefined &&
    locale !== undefined &&
    loadedLocale !== locale
  ) {
    reload()
    return {
      shouldHydrate: false,
      dispose: () => {
        /* No listener was installed. */
      }
    }
  }
  return { shouldHydrate: true, dispose: installLocaleHistoryGuard(reload) }
}
