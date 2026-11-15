import type { ContactPoint, PostalAddress } from 'schema-dts'

import { getLocale } from '../../../src/i18n/locale/index.ts'
import { localeTag } from '../../../src/i18n/localeTag/index.ts'

type ContactPointNode = Extract<ContactPoint, { '@type': 'ContactPoint' }>
type PostalAddressNode = Extract<PostalAddress, { '@type': 'PostalAddress' }>
type SiteOrganization = {
  contactPoint?: ContactPointNode
  address?: PostalAddressNode
}

const REPOSITORY_URL = 'https://github.com/everton-dgn/boilerplate_solidjs'

const AUTHOR_PROFILES = [
  'https://x.com/toffanettodev',
  'https://www.linkedin.com/in/everton-toffanetto/',
  'https://www.youtube.com/@toffanettodev'
]
const ORGANIZATION: SiteOrganization = {
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'demo',
    email: 'contato@example.com',
    telephone: '0000000000',
    description:
      'Placeholder values for this boilerplate demonstration. Do not use them to contact the maintainer.'
  },
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Rua de exemplo, 123',
    addressLocality: 'Cidade de exemplo',
    addressRegion: 'Estado de exemplo',
    postalCode: '00000-000',
    addressCountry: 'BR',
    description: 'Placeholder address for this boilerplate demonstration.'
  }
}

export const LOCALE_TAG_OVERRIDES = { fr: 'fr-FR', de: 'de-DE', ja: 'ja-JP' }

export const SITE = {
  title: 'SolidJS Boilerplate',
  get description(): string {
    return 'Independent runtime SEO fixture'
  },
  author: {
    name: 'Éverton Toffanetto',
    url: 'https://github.com/everton-dgn',
    twitter: '@toffanettodev',
    sameAs: AUTHOR_PROFILES
  },
  twitter: '@toffanettodev',
  get locale(): string {
    return localeTag(getLocale(), LOCALE_TAG_OVERRIDES)
  },
  url: 'https://runtime.example',
  repositoryUrl: REPOSITORY_URL,
  socialLinks: [REPOSITORY_URL, ...AUTHOR_PROFILES],
  organization: ORGANIZATION,
  logo: '/favicon/apple-touch-icon.png',
  image: {
    path: '/images/og.png',
    width: 1200,
    height: 630,
    get alt(): string {
      return 'Fixture cover'
    }
  }
}
