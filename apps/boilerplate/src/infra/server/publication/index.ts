import 'server-only'
import { createPublicationController } from '@evertondgn/solid-runtime/server/publication'

export const publication = createPublicationController()
export const { runPublication, getMetrics: getPublicationMetrics } = publication
