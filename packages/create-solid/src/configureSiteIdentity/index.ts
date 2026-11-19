import { readFileSync } from 'node:fs'
import path from 'node:path'

import { parse, record, string } from 'valibot'

import {
  catalogLanguage,
  readLocaleSettings
} from '../configureLocales/catalogs.ts'
import { editCatalog, editTemplate } from '../edit-template.ts'
import type { StagedContext } from '../types.ts'

const indent = 2
const messages = {
  home_features: {
    en: 'This application was built with Solid Base. Use the navigation links to open the about, contact and privacy pages. Each page has its own address, so you can bookmark it or share a direct link. The about page describes the project and the tools used to build it. The contact page explains what information to include when reporting a problem. The privacy page describes browser preferences and what happens when you follow an external link. Use the home link in the navigation to return to this page.',
    es: 'Esta aplicación se creó con Solid Base. Usa los enlaces de navegación para abrir las páginas de información, contacto y privacidad. Cada página tiene su propia dirección, que puedes guardar en tus favoritos o compartir con otra persona. La página de información presenta el proyecto y las herramientas utilizadas para crearlo. La página de contacto explica qué detalles incluir al comunicar un problema. La página de privacidad describe las preferencias del navegador y los enlaces externos. El enlace de inicio te permite volver a esta página.',
    pt: 'Esta aplicação foi criada com Solid Base. Use os links de navegação para abrir as páginas sobre o projeto, de contato e de privacidade. Cada página tem um endereço próprio que você pode salvar nos favoritos ou compartilhar com outra pessoa. A página sobre o projeto apresenta as ferramentas usadas no desenvolvimento. A página de contato explica quais informações incluir ao relatar um problema. A página de privacidade descreve as preferências do navegador e os links externos. Use o link de início para voltar a esta página.'
  },
  about_title: {
    en: 'About SolidJS Boilerplate',
    es: 'Acerca de SolidJS Boilerplate',
    pt: 'Sobre SolidJS Boilerplate'
  },
  about_intro: {
    en: 'This page describes SolidJS Boilerplate and the tools used to build it.',
    es: 'Esta página describe SolidJS Boilerplate y las herramientas de desarrollo que utiliza.',
    pt: 'Esta página apresenta SolidJS Boilerplate e as ferramentas usadas no desenvolvimento.'
  },
  about_description: {
    en: 'Learn about the application and its features.',
    es: 'Conoce la aplicación y sus funciones.',
    pt: 'Conheça a aplicação e seus recursos.'
  },
  about_source: {
    en: 'The application includes guides to its architecture and development tasks.',
    es: 'La aplicación incluye guías sobre su arquitectura y las tareas de desarrollo.',
    pt: 'A aplicação inclui guias sobre sua arquitetura e as tarefas de desenvolvimento.'
  },
  contact_description: {
    en: 'Contact information for SolidJS Boilerplate.',
    es: 'Información de contacto de SolidJS Boilerplate.',
    pt: 'Informações de contato de SolidJS Boilerplate.'
  },
  contact_intro: {
    en: 'Use this page to prepare a question or report a problem.',
    es: 'Usa esta página para preparar una consulta o informar de un problema.',
    pt: 'Use esta página para preparar uma pergunta ou relatar um problema.'
  },
  contact_maintainerTitle: {
    en: 'Details to include',
    es: 'Detalles que puedes incluir',
    pt: 'Detalhes do relato'
  },
  privacy_intro: {
    en: 'This page describes how this application handles privacy.',
    es: 'Esta página describe cómo se gestiona la privacidad en esta aplicación.',
    pt: 'Esta página descreve como esta aplicação trata a privacidade.'
  },
  contact_issues: {
    en: 'When reporting a problem, describe what happened and the steps needed to reproduce it. Leave out private information.',
    es: 'Al informar de un problema, describe qué pasó y cómo reproducirlo. Omite los datos privados.',
    pt: 'Ao relatar um problema, descreva o que aconteceu e os passos para reproduzi-lo. Omita os dados privados.'
  },
  contact_maintainer: {
    en: 'Use the contact details listed on this page when they are available. Describe the page you visited, the language you selected and the result you expected. If you include an example, use fictional data and remove personal details from any screenshots. Keep a copy of the report so that you can add information if the problem happens again.',
    es: 'Utiliza los datos de contacto de esta página cuando estén disponibles. Indica qué página visitaste, qué idioma elegiste y qué resultado esperabas. Si incluyes un ejemplo, utiliza datos ficticios y elimina la información personal de las capturas de pantalla. Guarda una copia del informe para añadir detalles si el problema vuelve a ocurrir.',
    pt: 'Use os dados de contato desta página quando estiverem disponíveis. Informe a página visitada, o idioma escolhido e o resultado esperado. Se incluir um exemplo, use dados fictícios e remova informações pessoais das capturas de tela. Guarde uma cópia do relato para acrescentar detalhes caso o problema volte a ocorrer.'
  }
}
type Replacement = { pattern: RegExp | string; replacement: string }
type IdentityEdit = (file: string) => (change: Replacement) => void

function neutralCopy({ stage, profile, write }: StagedContext): void {
  for (const locale of readLocaleSettings(stage).locales) {
    const language = catalogLanguage(locale)
    for (const page of ['(home)', 'about', 'contact', 'privacy']) {
      const file = `src/routes/(base)/${page}/i18n/${locale}.json`
      const text = readFileSync(path.join(stage, file), 'utf8')
      const catalog = parse(record(string(), string()), JSON.parse(text))
      for (const [key, value] of Object.entries(messages)) {
        if (!key.startsWith(page === '(home)' ? 'home_' : page)) continue
        if (key.endsWith('_description') && profile.hasSeo === false) continue
        editCatalog({ file, catalog, key, value: value[language] })
      }
      write({ file, content: `${JSON.stringify(catalog, null, indent)}\n` })
    }
  }
}

function removePublisher(edit: IdentityEdit): void {
  const site = 'src/constants/site/index.ts'
  edit(site)({
    pattern: /^const REPOSITORY_URL = [\s\S]*?(?=export const SITE)/mu,
    replacement:
      "const ORGANIZATION: SiteOrganization = {}\nconst AUTHOR = { name: '', url: '', twitter: '', sameAs: [] as string[] }\n\n"
  })
  edit(site)({
    pattern: / {2}author: \{[\s\S]*?\n {2}twitter: '@toffanettodev',/u,
    replacement: "  author: AUTHOR,\n  twitter: '',"
  })
  edit(site)({
    pattern:
      /repositoryUrl: REPOSITORY_URL,\n {2}socialLinks: \[REPOSITORY_URL, \.\.\.AUTHOR_PROFILES\]/u,
    replacement: "repositoryUrl: '',\n  socialLinks: [] as string[]"
  })
  edit('src/Document.tsx')({
    pattern: '<meta name="author" content={SITE.author.name} />',
    replacement:
      '{SITE.author.name && <meta name="author" content={SITE.author.name} />}'
  })
  edit('src/primitives/createSeo/index.ts')({
    pattern: '    createRuntimeSeo({\n      ...options,\n      site: SITE,',
    replacement:
      '    const { author, organization, socialLinks, ...site } = SITE\n    createRuntimeSeo({\n      ...options,\n      site: {\n        ...site,\n        ...(author.name && { author }),\n        ...(Object.keys(organization).length > 0 && { organization }),\n        ...(socialLinks.length > 0 && { socialLinks })\n      },'
  })
}

function checkPublisher(edit: IdentityEdit): void {
  const home = 'src/tests/pages/Home/Home.seo.e2e.test.ts'
  edit(home)({
    pattern:
      /\/\/ WebSite, page and Organization[^\n]*\nconst BASE_GRAPH_NODES = 3/u,
    replacement:
      '// The application publishes its site and page before an organization is configured.\nconst BASE_GRAPH_NODES = 2'
  })
  edit(home)({
    pattern:
      / {4}const logoNode = expect\.objectContaining\(\{[\s\S]*?\n {4}\}\)\n/u,
    replacement: ''
  })
  edit(home)({
    pattern:
      /,\n {6}\{\n {8}'@type': 'Organization',[\s\S]*?logo: logoNode\n {6}\}/u,
    replacement: ''
  })
  edit(home)({
    pattern: /,\n {8}publisher: \{ '@id': `\$\{siteUrl\}\/#organization` \}/u,
    replacement: ''
  })
  edit(home)({
    pattern:
      "    expect(await readStructuredData(page)).toContainEqual(\n      expect.objectContaining({\n        '@type': 'Article',",
    replacement:
      "    const graph = await readStructuredData(page)\n    const article = graph.find(node => node['@type'] === 'Article')\n    expect(article).not.toHaveProperty('publisher')\n    expect(article).not.toHaveProperty('author')\n    expect(graph).toContainEqual(\n      expect.objectContaining({\n        '@type': 'Article',"
  })
  edit('src/tests/pages/I18n/I18n.seo.production.e2e.test.ts')({
    pattern:
      /expect\(graph\)\.toContainEqual\(\n {6}expect\.objectContaining\(\{\n {8}'@type': 'Organization',[\s\S]*?\n {4}\)/u,
    replacement:
      "expect(graph).not.toContainEqual(\n      expect.objectContaining({ '@type': 'Organization' })\n    )"
  })
}

export function configureSiteIdentity(context: StagedContext): void {
  const { stage, profile, write } = context
  const edit: IdentityEdit =
    file =>
    ({ pattern, replacement }) => {
      const text = readFileSync(path.join(stage, file), 'utf8')
      write({
        file,
        content: editTemplate({ file, text, pattern, replacement })
      })
    }
  neutralCopy(context)
  if (profile.hasSeo !== false) {
    removePublisher(edit)
    if ((profile.mode ?? 'server') === 'server') checkPublisher(edit)
  }
  const topbar = 'src/components/organisms/Topbar/index.tsx'
  const file = path.join(stage, topbar)
  const source = readFileSync(file, 'utf8')
  const anchor = /^ {8}<a\n {10}class=\{S.github_link\}[\s\S]*?^ {8}<\/a>/mu
  const link = anchor.exec(source)?.[0]
  if (!link) throw new Error('Missing repository link in Topbar')
  edit(topbar)({
    pattern: anchor,
    replacement: `        {SITE.repositoryUrl && (\n${link
      .split('\n')
      .map(line => `  ${line}`)
      .join('\n')}\n        )}`
  })
  edit('src/routes/(base)/about/index.tsx')({
    pattern: / {6}SITE_LINKS.repository,[\s\S]*?\n {6}\}/u,
    replacement: `      ...(SITE.repositoryUrl\n        ? [\n            SITE_LINKS.repository,\n            {\n              label: m.about_documentationLabel(),\n              href: \`\${SITE.repositoryUrl}#readme\`\n            }\n          ]\n        : [])`
  })
  edit('src/routes/(base)/contact/index.tsx')({
    pattern:
      / {6}\{ label: m.contact_issuesLabel[\s\S]*?href: SITE.author.url \}/u,
    replacement: `      ...(SITE.repositoryUrl\n        ? [\n            {\n              label: m.contact_issuesLabel(),\n              href: \`\${SITE.repositoryUrl}/issues\`\n            }\n          ]\n        : []),\n      ...(SITE.author.url\n        ? [{ label: m.contact_maintainerLabel(), href: SITE.author.url }]\n        : [])`
  })
  const unit =
    'src/components/molecules/SiteContent/__tests__/SiteContent.dom.test.tsx'
  edit(unit)({
    pattern: "import { SITE } from '@/constants/site/index.ts'\n",
    replacement: ''
  })
  edit(unit)({
    pattern: /SITE.repositoryUrl/gu,
    replacement: "'https://example.com'"
  })
  edit(unit)({
    pattern: /`\$\{'https:\/\/example.com'\}#readme`/gu,
    replacement: "'https://example.com#readme'"
  })
  edit('README.md')({
    pattern:
      'This SolidJS application uses the Solid Base tooling and runtime.',
    replacement: [
      'This application was created with Solid Base.',
      '',
      '## Before publishing',
      '',
      '- Fill in the site identity and public links in `src/constants/site/index.ts`.',
      '- Update the about and contact pages with your own information.',
      '- Describe your data practices on the privacy page.',
      '- Rewrite the home page texts for your application.',
      '- To rename the app, update `src/constants/site/title.ts` and the page messages.',
      ...(profile.hasSeo === false
        ? []
        : [
            '- Set `VITE_SITE_URL` to your public origin in `.env`.',
            '- Replace `public/images/og.png` and update its `site_imageAlt` text.',
            '- Update the site description in `site_description`.',
            '- Rewrite the `llms.txt` notes in `src/routes/(seo)/llms.txt/constants.ts`.'
          ])
    ].join('\n')
  })
  if ((profile.mode ?? 'server') !== 'server') return
  edit('docs/development.md')({
    pattern:
      /^> The following workflow is an example from the upstream application\.[\s\S]*?(?=Nitro is defined)/mu,
    replacement:
      'Configure the deployment for your own hosting account and domain.\n\n'
  })
  if (profile.hasSeo !== false) {
    for (const [pattern, replacement] of [
      ['# About SolidJS Boilerplate', '# About the application'],
      ['# SolidJS Boilerplate', '# Application title'],
      ['[About SolidJS Boilerplate]', '[About the application]']
    ] as const) {
      edit('README.md')({ pattern, replacement })
    }
    edit('README.md')({
      pattern:
        /SolidJS Boilerplate is an open source project maintained by Éverton Toffanetto\. \.\.\./u,
      replacement: 'The application provides localized pages and navigation.'
    })
    edit('README.md')({
      pattern: /https:\/\/boilerplate-solidjs.devinsights.dev/gu,
      replacement: 'https://example.com'
    })
  }
}
