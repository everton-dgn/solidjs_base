/* oxlint-disable node/no-sync -- Mutations only change the owned temporary application before its build. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

type Mutation = { app: string; mutation?: string }

export function mutatePublication({ app, mutation }: Mutation): void {
  if (mutation === 'llms-link') {
    const config = path.join(app, 'vite.config.ts')
    writeFileSync(
      config,
      readFileSync(config, 'utf8').replace(
        'root: import.meta.dirname,',
        `root: import.meta.dirname, routeRules: {'/unexpected/**': {headers: {link: '</llms.txt>; rel="describedby"'}}},`
      )
    )
  }
  if (mutation === 'llms-module') {
    const directory = path.join(app, 'src/routes/unexpected-llms')
    mkdirSync(directory, { recursive: true })
    const helper = path.join(
      app,
      'node_modules/@evertondgn/solid-runtime/src/seo/llms/helpers/buildLlmsText/index.ts'
    )
    writeFileSync(
      path.join(directory, 'index.ts'),
      `import { buildLlmsText } from ${JSON.stringify(helper)}
export const GET = () => new Response(buildLlmsText({title: 'Unexpected', description: '', notes: [], pages: [], siteUrl: 'https://scenario.example'}))
`
    )
  }
}
