import {
  baseLocale,
  locales,
  getLocale,
  localizeHref,
  deLocalizeUrl,
  extractLocaleFromUrl
} from '@evertondgn/solid-runtime/i18n/locale'
import { prepareClientLocale } from '@evertondgn/solid-runtime/i18n/prepare-client-locale'
import { describe, expect, it } from 'vite-plus/test'

describe('runtime locale', () => {
  it('prepares the entry without translations or a locale reload', () => {
    let hasReloaded = false
    const locale = prepareClientLocale({
      reload: () => {
        hasReloaded = true
      }
    })
    locale.dispose()
    expect(locale.shouldHydrate).toBe(true)
    expect(hasReloaded).toBe(false)
  })

  it('uses the application locale provider', () => {
    expect(baseLocale).toBe('en')
    expect(locales).toContain('en')
    expect(getLocale()).toBe('en')
  })

  it('uses the URL provider', () => {
    expect(localizeHref('/about', { locale: 'en' })).toBe('/about')
    expect(deLocalizeUrl(new URL('https://example.com/about')).pathname).toBe(
      '/about'
    )
    expect(extractLocaleFromUrl('https://example.com/about')).toBeUndefined()
  })
})
