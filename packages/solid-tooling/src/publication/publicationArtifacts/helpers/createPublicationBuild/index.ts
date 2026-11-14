import { randomUUID } from 'node:crypto'

type BuildDefine = { define: Record<string, string> }
type BuildPlugin = { name: string; config: () => BuildDefine }
type PublicationBuild = { buildId: string; plugin: BuildPlugin }

const BUILD_ID_DEFINE = 'import.meta.env.PUBLICATION_BUILD_ID'

// SSR precedes prerender, so its build identity must be defined here. Share it
// with the Nitro module and function manifest to bind artifacts to their consumer.
export function createPublicationBuild(): PublicationBuild {
  const buildId = randomUUID()
  return {
    buildId,
    plugin: {
      name: 'project:publication-build',
      config: () => ({ define: { [BUILD_ID_DEFINE]: JSON.stringify(buildId) } })
    }
  }
}
