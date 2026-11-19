import { readFileSync } from 'node:fs'
import path from 'node:path'

import { parse, record, string } from 'valibot'

import { editCatalog, editTemplate } from '../edit-template.ts'
import type { StagedContext } from '../types.ts'

const indent = 2
const messages = {
  en: {
    about_intro: 'SolidJS Boilerplate provides localized pages and navigation.',
    about_description: 'Learn about the application and its features.',
    about_source:
      'The application includes guides to its architecture and development tasks.',
    contact_description: 'Contact information for SolidJS Boilerplate.',
    contact_intro:
      'This page lists the contact options available for SolidJS Boilerplate.',
    contact_issues:
      'When reporting a problem, describe what happened and the steps needed to reproduce it. Leave out private information.',
    contact_maintainer:
      'Use the contact details listed on this page when they are available. Describe the page you visited, the language you selected and the result you expected. If you include an example, use fictional data and remove personal details from any screenshots. Keep a copy of the report so that you can add information if the problem happens again.'
  },
  es: {
    about_intro:
      'SolidJS Boilerplate ofrece páginas y navegación en varios idiomas.',
    about_description: 'Conoce la aplicación y sus funciones.',
    about_source:
      'La aplicación incluye guías sobre su arquitectura y las tareas de desarrollo.',
    contact_description: 'Información de contacto de SolidJS Boilerplate.',
    contact_intro:
      'Esta página reúne las opciones de contacto disponibles para SolidJS Boilerplate.',
    contact_issues:
      'Al informar de un problema, describe qué pasó y cómo reproducirlo. Omite los datos privados.',
    contact_maintainer:
      'Utiliza los datos de contacto de esta página cuando estén disponibles. Indica qué página visitaste, qué idioma elegiste y qué resultado esperabas. Si incluyes un ejemplo, utiliza datos ficticios y elimina la información personal de las capturas de pantalla. Guarda una copia del informe para añadir detalles si el problema vuelve a ocurrir.'
  },
  pt: {
    about_intro:
      'SolidJS Boilerplate oferece páginas e navegação em vários idiomas.',
    about_description: 'Conheça a aplicação e seus recursos.',
    about_source:
      'A aplicação inclui guias sobre sua arquitetura e as tarefas de desenvolvimento.',
    contact_description: 'Informações de contato de SolidJS Boilerplate.',
    contact_intro:
      'Esta página reúne as opções de contato disponíveis para SolidJS Boilerplate.',
    contact_issues:
      'Ao relatar um problema, descreva o que aconteceu e os passos para reproduzi-lo. Omita os dados privados.',
    contact_maintainer:
      'Use os dados de contato desta página quando estiverem disponíveis. Informe a página visitada, o idioma escolhido e o resultado esperado. Se incluir um exemplo, use dados fictícios e remova informações pessoais das capturas de tela. Guarde uma cópia do relato para acrescentar detalhes caso o problema volte a ocorrer.'
  }
}
type IdentityEdit = (
  file: string
) => (pattern: RegExp | string, replacement: string) => void

function neutralCopy({ stage, profile, write }: StagedContext): void {
  for (const [locale, copy] of Object.entries(messages)) {
    for (const page of ['about', 'contact']) {
      const file = `src/routes/(base)/${page}/i18n/${locale}.json`
      const text = readFileSync(path.join(stage, file), 'utf8')
      const catalog = parse(record(string(), string()), JSON.parse(text))
      for (const [key, value] of Object.entries(copy)) {
        if (!key.startsWith(page)) continue
        if (key.endsWith('_description') && profile.hasSeo === false) continue
        editCatalog({ file, catalog, key, value })
      }
      write({ file, content: `${JSON.stringify(catalog, null, indent)}\n` })
    }
  }
}

function removePublisher(edit: IdentityEdit): void {
  const site = 'src/constants/site/index.ts'
  edit(site)(
    /^const REPOSITORY_URL = [\s\S]*?(?=export const SITE)/mu,
    "const ORGANIZATION: SiteOrganization = {}\nconst AUTHOR = { name: '', url: '', twitter: '', sameAs: [] as string[] }\n\n"
  )
  edit(site)(
    / {2}author: \{[\s\S]*?\n {2}twitter: '@toffanettodev',/u,
    "  author: AUTHOR,\n  twitter: '',"
  )
  edit(site)(
    /repositoryUrl: REPOSITORY_URL,\n {2}socialLinks: \[REPOSITORY_URL, \.\.\.AUTHOR_PROFILES\]/u,
    "repositoryUrl: '',\n  socialLinks: [] as string[]"
  )
  edit('src/Document.tsx')(
    '<meta name="author" content={SITE.author.name} />',
    '{SITE.author.name && <meta name="author" content={SITE.author.name} />}'
  )
  edit('src/primitives/createSeo/index.ts')(
    '    createRuntimeSeo({\n      ...options,\n      site: SITE,',
    '    const { author, organization, socialLinks, ...site } = SITE\n    createRuntimeSeo({\n      ...options,\n      site: {\n        ...site,\n        ...(author.name && { author }),\n        ...(Object.keys(organization).length > 0 && { organization }),\n        ...(socialLinks.length > 0 && { socialLinks })\n      },'
  )
}

function checkPublisher(edit: IdentityEdit): void {
  const home = 'src/tests/pages/Home/Home.seo.e2e.test.ts'
  edit(home)(
    /\/\/ WebSite, page and Organization[^\n]*\nconst BASE_GRAPH_NODES = 3/u,
    '// The application publishes its site and page before an organization is configured.\nconst BASE_GRAPH_NODES = 2'
  )
  edit(home)(
    / {4}const logoNode = expect\.objectContaining\(\{[\s\S]*?\n {4}\}\)\n/u,
    ''
  )
  edit(home)(
    /,\n {6}\{\n {8}'@type': 'Organization',[\s\S]*?logo: logoNode\n {6}\}/u,
    ''
  )
  edit(home)(
    /,\n {8}publisher: \{ '@id': `\$\{siteUrl\}\/#organization` \}/u,
    ''
  )
  edit(home)(
    "    expect(await readStructuredData(page)).toContainEqual(\n      expect.objectContaining({\n        '@type': 'Article',",
    "    const graph = await readStructuredData(page)\n    const article = graph.find(node => node['@type'] === 'Article')\n    expect(article).not.toHaveProperty('publisher')\n    expect(article).not.toHaveProperty('author')\n    expect(graph).toContainEqual(\n      expect.objectContaining({\n        '@type': 'Article',"
  )
  edit('src/tests/pages/I18n/I18n.seo.production.e2e.test.ts')(
    /expect\(graph\)\.toContainEqual\(\n {6}expect\.objectContaining\(\{\n {8}'@type': 'Organization',[\s\S]*?\n {4}\)/u,
    "expect(graph).not.toContainEqual(\n      expect.objectContaining({ '@type': 'Organization' })\n    )"
  )
}

export function configureSiteIdentity(context: StagedContext): void {
  const { stage, profile, write } = context
  const edit: IdentityEdit = file => (pattern, replacement) => {
    const text = readFileSync(path.join(stage, file), 'utf8')
    write({ file, content: editTemplate({ file, text, pattern, replacement }) })
  }
  neutralCopy(context)
  if (profile.hasSeo === false) {
    edit('src/constants/site/index.ts')(
      /author: \{ url: '[^']+' \},\n {2}repositoryUrl: '[^']+'/u,
      "author: { name: '', url: '' },\n  twitter: '',\n  socialLinks: [] as string[],\n  organization: {},\n  repositoryUrl: ''"
    )
  } else {
    removePublisher(edit)
    if ((profile.mode ?? 'server') === 'server') checkPublisher(edit)
  }
  const topbar = 'src/components/organisms/Topbar/index.tsx'
  const file = path.join(stage, topbar)
  const source = readFileSync(file, 'utf8')
  const anchor = /^ {8}<a\n {10}class=\{S.github_link\}[\s\S]*?^ {8}<\/a>/mu
  const link = anchor.exec(source)?.[0]
  if (!link) throw new Error('Missing repository link in Topbar')
  edit(topbar)(
    anchor,
    `        {SITE.repositoryUrl && (\n${link
      .split('\n')
      .map(line => `  ${line}`)
      .join('\n')}\n        )}`
  )
  edit('src/routes/(base)/about/index.tsx')(
    / {6}SITE_LINKS.repository,[\s\S]*?\n {6}\}/u,
    `      ...(SITE.repositoryUrl\n        ? [\n            SITE_LINKS.repository,\n            {\n              label: m.about_documentationLabel(),\n              href: \`\${SITE.repositoryUrl}#readme\`\n            }\n          ]\n        : [])`
  )
  edit('src/routes/(base)/contact/index.tsx')(
    / {6}\{ label: m.contact_issuesLabel[\s\S]*?href: SITE.author.url \}/u,
    `      ...(SITE.repositoryUrl\n        ? [\n            {\n              label: m.contact_issuesLabel(),\n              href: \`\${SITE.repositoryUrl}/issues\`\n            }\n          ]\n        : []),\n      ...(SITE.author.url\n        ? [{ label: m.contact_maintainerLabel(), href: SITE.author.url }]\n        : [])`
  )
  const unit =
    'src/components/molecules/SiteContent/__tests__/SiteContent.dom.test.tsx'
  edit(unit)("import { SITE } from '@/constants/site/index.ts'\n", '')
  edit(unit)(/SITE.repositoryUrl/gu, "'https://example.com'")
  edit(unit)(
    /`\$\{'https:\/\/example.com'\}#readme`/gu,
    "'https://example.com#readme'"
  )
  edit('README.md')(
    'This SolidJS application uses the Solid Base tooling and runtime.',
    'This application was created with Solid Base.\n\n## Before publishing\n\n- Fill in the site identity and public links in `src/constants/site/index.ts`.\n- Update the about and contact pages with your own information.\n- Describe your data practices on the privacy page.'
  )
  if ((profile.mode ?? 'server') !== 'server') return
  edit('docs/development.md')(
    /^> The following workflow is an example from the upstream application\.[\s\S]*?(?=Nitro is defined)/mu,
    'Configure the deployment for your own hosting account and domain.\n\n'
  )
  if (profile.hasSeo !== false) {
    edit('README.md')(
      /SolidJS Boilerplate is an open source project maintained by Éverton Toffanetto\. \.\.\./u,
      'The application provides localized pages and navigation.'
    )
    edit('README.md')(
      /https:\/\/boilerplate-solidjs.devinsights.dev/gu,
      'https://example.com'
    )
  }
}
