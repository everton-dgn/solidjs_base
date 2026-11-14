import { getLocale } from '@evertondgn/solid-runtime/i18n/locale'
import { origin } from '@evertondgn/solid-runtime/seo/origin'

export const site = {
  title: 'Scenario application',
  description: 'Independent SEO fixture',
  url: origin,
  get locale(): string {
    return getLocale()
  },
  image: { path: '/cover.png', width: 1200, height: 630, alt: 'Cover' },
  logo: '/logo.png',
  twitter: '@scenario',
  author: {
    name: 'Example',
    url: 'https://scenario.example/',
    twitter: '@example',
    sameAs: []
  },
  socialLinks: [],
  organization: {}
}
