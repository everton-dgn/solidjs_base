import {
  baseLocale,
  locales,
  localizeHref,
  deLocalizeUrl,
  extractLocaleFromUrl
} from '@evertondgn/solid-runtime/i18n/locale'
import { describe, expect, it } from 'vite-plus/test'

describe('runtime locale', () => {
  it('uses the application locale provider', () => {
    expect(baseLocale).toBe('fr')
    expect(locales).toContain('fr')
  })

  it('uses the URL provider', () => {
    expect(localizeHref('/about', { locale: 'fr' })).toBe('/fr/about')
    expect(
      deLocalizeUrl(new URL('https://example.com/fr/about')).pathname
    ).toBe('/about')
    expect(extractLocaleFromUrl('https://example.com/fr/about')).toBe('fr')
  })
})
