import {
  PUBLICATION_PHASE_ENV,
  PUBLICATION_PRERENDER_PHASE
} from '../publication/protocol.js'

type PublicationPhase = 'direct' | 'prerender' | 'artifact'

// The build sets this flag in the prerender worker environment. Public request
// headers such as x-nitro-prerender cannot change it.
export function readPublicationPhase(): PublicationPhase {
  if (!import.meta.env.PROD) return 'direct'
  return process.env[PUBLICATION_PHASE_ENV] === PUBLICATION_PRERENDER_PHASE
    ? 'prerender'
    : 'artifact'
}
