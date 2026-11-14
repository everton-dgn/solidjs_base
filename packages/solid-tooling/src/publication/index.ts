import { markdownPrerender } from './markdownPrerender/index.ts'
import type { PublicationFeatures } from './options.ts'
import { createPublicationBuild } from './publicationArtifacts/helpers/createPublicationBuild/index.ts'

type PublicationBuild = {
  plugin: ReturnType<typeof createPublicationBuild>['plugin']
  module: ReturnType<typeof markdownPrerender>
}
export function publicationBuild(
  features: PublicationFeatures
): PublicationBuild {
  const publication = createPublicationBuild()
  return {
    plugin: publication.plugin,
    module: markdownPrerender({
      buildId: publication.buildId,
      hasMarkdown:
        typeof features.markdown === 'object' &&
        features.markdown.static === true,
      hasSitemap: typeof features.sitemap === 'object',
      hasLlms: Boolean(features.llms),
      hasLlmsFull: Boolean(features.llmsFull),
      llmsMaxBytes:
        typeof features.llms === 'object' ? features.llms.maxBytes : undefined,
      llmsFullMaxBytes:
        typeof features.llmsFull === 'object'
          ? features.llmsFull.maxBytes
          : undefined
    })
  }
}
