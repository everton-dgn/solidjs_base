import {
  PUBLICATION_PHASE_ENV,
  PUBLICATION_PRERENDER_PHASE,
  PUBLICATION_ARTIFACT_DIR,
  SITEMAP_MANIFEST_FILE,
  SITEMAP_IDENTITIES_FILE,
  SITEMAP_ARTIFACT_VERSION,
  SITEMAP_MANIFEST_MAX_BYTES,
  SITEMAP_IDENTITIES_MAX_BYTES
} from '../protocol.js'

const protocol = {
  PUBLICATION_PHASE_ENV,
  PUBLICATION_PRERENDER_PHASE,
  PUBLICATION_ARTIFACT_DIR,
  SITEMAP_MANIFEST_FILE,
  SITEMAP_IDENTITIES_FILE,
  SITEMAP_ARTIFACT_VERSION,
  SITEMAP_MANIFEST_MAX_BYTES,
  SITEMAP_IDENTITIES_MAX_BYTES
} as const

// Literal annotations bind the handwritten declarations to these expected values.
const EXPECTED: typeof protocol = {
  PUBLICATION_PHASE_ENV: 'PUBLICATION_BUILD_PHASE',
  PUBLICATION_PRERENDER_PHASE: 'prerender',
  PUBLICATION_ARTIFACT_DIR: 'publication',
  SITEMAP_MANIFEST_FILE: 'sitemap-manifest.json',
  SITEMAP_IDENTITIES_FILE: 'sitemap-identities.json',
  SITEMAP_ARTIFACT_VERSION: 1,
  SITEMAP_MANIFEST_MAX_BYTES: 1_048_576,
  SITEMAP_IDENTITIES_MAX_BYTES: 33_554_432
}

describe('publication protocol', () => {
  it('keeps the JavaScript values and handwritten declarations aligned', () => {
    expect({ ...protocol }).toStrictEqual(EXPECTED)
  })
})
