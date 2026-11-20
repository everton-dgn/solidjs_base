type LanguageInput = {
  requested?: string
  environment: Partial<Record<'LC_ALL' | 'LC_MESSAGES' | 'LANG', string>>
  intlLocale: string
}

export function cliLanguage({
  requested,
  environment,
  intlLocale
}: LanguageInput): Language {
  for (const candidate of [
    requested,
    environment.LC_ALL,
    environment.LC_MESSAGES,
    environment.LANG,
    intlLocale
  ]) {
    if (!candidate) continue
    const tag = candidate.split('.')[0]?.replaceAll('_', '-')
    if (!tag) continue
    if (tag === 'C' || tag === 'POSIX') return 'en'
    try {
      const locale = new Intl.Locale(tag)
      if (locale.baseName === 'pt-BR' || locale.language === 'pt') {
        return 'pt-BR'
      }
      if (locale.language === 'en' || locale.language === 'es') {
        return locale.language
      }
    } catch (error) {
      if (!(error instanceof RangeError)) throw error
    }
  }
  return 'en'
}

export const messages = {
  en: {
    setup: 'Setup',
    recommended: 'Recommended',
    custom: 'Customize',
    features: 'Features (Space to toggle, Enter to continue)',
    serverHint: 'Renders each request on Vercel (--mode server).',
    staticHint: 'Builds HTML with SEO for a file host (--mode static).',
    clientHint:
      'The host serves index.html for every route. One language, no SEO (--mode client).',
    bunHint: 'Recommended. Installs dependencies and runs every task.',
    installHint: 'Installs dependencies only. Bun still runs every task.',
    featureList: 'Features',
    none: 'None',
    installation: 'Installation',
    create: 'Create the project?',
    ready: 'Project created.',
    tagline: 'Create a standalone Solid application.',
    languages: 'Languages',
    manager: 'Package manager',
    usage: `bunx @evertondgn/create-solid@latest [DIR]

Project
  --name DIR                  Project folder
  --title TEXT                Application title
  --mode server|static|client  Rendering mode

Features
  --seo                       Publish SEO metadata
  --no-seo                    Do not publish SEO metadata
  --theme                     Add the theme switcher
  --no-theme                  Do not add the theme switcher
  --icons                     Include icons
  --no-icons                  Do not include icons
  --fonts                     Bundle Inter
  --no-fonts                  Do not bundle Inter
  --diagnostics               Enable Solid reactivity diagnostics
  --no-diagnostics            Do not enable Solid reactivity diagnostics
  --i18n                      Enable translations
  --no-i18n                   Do not enable translations
  --locales TAGS              Application languages
  --base-locale TAG           Base language
  --site-url URL              Public site URL

Installation
  --pm bun|npm|pnpm           Package manager
  --git                       Initialize Git
  --no-git                    Do not initialize Git
  --install                   Install dependencies
  --no-install                Do not install dependencies

Automation
  --yes                       Use defaults and skip confirmation
  --no-interactive            Read settings from flags
  --lang pt-BR|en|es          Questionnaire language
  --help                      Show this help
  -h                          Show this help`,
    automation:
      'Use --yes to accept defaults. With --no-interactive, CI or redirected input, provide a destination or use --yes.',
    publishList: 'See "Before publishing" in README.md.',
    setUrl: 'Set VITE_SITE_URL before publishing.',
    seed: 'Translate the seeded messages for {tag}.',
    windows: 'create-solid supports macOS and Linux. Windows is unsupported.',
    tool: 'Install {tool} before generating the application. {link}',
    retry: 'Check again',
    skipInstall: 'Skip installation',
    gitFailure:
      'Git initialization failed. Open {dir} and run git init with Git installed, or continue without Git. Run {pm} install to install dependencies.',
    installFailure: 'Open {dir} and run {pm} install again.',
    formatFailure:
      'pnpm installed dependencies. Check the local Vite+ installation and run pnpm exec vp fmt pnpm-workspace.yaml in the application.',
    creating: 'Creating application files',
    gitTask: 'Initializing Git',
    installTask: 'Installing dependencies with {pm}',
    dir: 'Project directory',
    title: 'Application title',
    mode: 'Rendering mode',
    server: 'Server (SSR)',
    static: 'Static HTML',
    client: 'Client only (SPA)',
    i18n: 'Enable translations?',
    locales: 'Language tags, separated by commas',
    appLanguage: 'Application language',
    base: 'Base language',
    seo: 'SEO metadata',
    url: 'Public site URL',
    theme: 'Light and dark theme switcher',
    icons: 'Icons',
    fonts: 'Self-hosted Inter font',
    diagnostics: 'Solid reactivity diagnostics in development',
    installer: 'Package manager',
    git: 'Create a Git repository?',
    install: 'Install dependencies?',
    yes: 'Yes',
    no: 'No',
    cancel: 'Creation canceled.',
    summary: 'Project settings',
    next: 'Next steps',
    missingBun: 'Install Bun from https://bun.sh before running tasks.',
    defaults:
      'Defaults: solid-app, folder name as title, server on Vercel, pt/en/es (base en), all features, https://example.com, Bun, Git and installation.',
    destination: '--name requires a new or empty directory',
    badTitle:
      '--title requires nonempty text on one line without control characters',
    origin: '--site-url requires an HTTP or HTTPS origin',
    needsSeo: '--site-url requires SEO',
    clientSeo: 'Client rendering cannot publish SEO. Use --mode static.',
    tag: '{flag} requires a valid BCP 47 language tag: {value}',
    list: '--locales requires a nonempty list of distinct language tags',
    noTranslations: '--locales cannot be combined with --no-i18n',
    membership: '--base-locale must be in --locales',
    clientLanguages:
      '--locales accepts one language in client mode. Use --mode static for multiple languages.',
    conflict: 'Choose either --{value} or --no-{value}.',
    invalid: 'Invalid option: {flag}'
  },
  'pt-BR': {
    setup: 'Configuração',
    recommended: 'Recomendada',
    custom: 'Personalizar',
    features: 'Recursos (Espaço para marcar, Enter para continuar)',
    serverHint: 'Renderiza cada requisição na Vercel (--mode server).',
    staticHint:
      'Gera HTML com SEO no build para hospedagem de arquivos (--mode static).',
    clientHint:
      'O host serve index.html em todas as rotas. Um idioma, sem SEO (--mode client).',
    bunHint: 'Recomendado. Instala dependências e executa todas as tarefas.',
    installHint: 'Só instala dependências. O Bun executa todas as tarefas.',
    featureList: 'Recursos',
    none: 'Nenhum',
    installation: 'Instalação',
    create: 'Criar o projeto?',
    ready: 'Projeto criado.',
    tagline: 'Crie uma aplicação Solid independente.',
    languages: 'Idiomas',
    manager: 'Gerenciador de pacotes',
    usage: `bunx @evertondgn/create-solid@latest [DIR]

Projeto
  --name DIR                  Pasta do projeto
  --title TEXT                Título da aplicação
  --mode server|static|client  Modo de renderização

Recursos
  --seo                       Publicar metadados de SEO
  --no-seo                    Não publicar metadados de SEO
  --theme                     Incluir o seletor de tema
  --no-theme                  Não incluir o seletor de tema
  --icons                     Incluir ícones
  --no-icons                  Não incluir ícones
  --fonts                     Hospedar a fonte Inter
  --no-fonts                  Não hospedar a fonte Inter
  --diagnostics               Ativar diagnóstico de reatividade do Solid
  --no-diagnostics            Não ativar diagnóstico de reatividade do Solid
  --i18n                      Ativar traduções
  --no-i18n                   Não ativar traduções
  --locales TAGS              Idiomas da aplicação
  --base-locale TAG           Idioma base
  --site-url URL              URL pública do site

Instalação
  --pm bun|npm|pnpm           Gerenciador de pacotes
  --git                       Criar um repositório Git
  --no-git                    Não criar um repositório Git
  --install                   Instalar dependências
  --no-install                Não instalar dependências

Automação
  --yes                       Usar os padrões e pular a confirmação
  --no-interactive            Usar as opções da linha de comando
  --lang pt-BR|en|es          Idioma do questionário
  --help                      Mostrar esta ajuda
  -h                          Mostrar esta ajuda`,
    automation:
      'Use --yes para aceitar os padrões. Com --no-interactive, CI ou entrada redirecionada, informe o destino ou use --yes.',
    publishList: 'Consulte "Before publishing" no README.md.',
    setUrl: 'Defina VITE_SITE_URL antes de publicar.',
    seed: 'Traduza as mensagens iniciais de {tag}.',
    windows:
      'O create-solid funciona no macOS e no Linux. O Windows não tem suporte.',
    tool: 'Instale {tool} antes de gerar a aplicação. {link}',
    retry: 'Verificar novamente',
    skipInstall: 'Pular a instalação',
    gitFailure:
      'Falha ao criar o repositório. Abra {dir} e execute git init com o Git instalado, ou continue sem Git. Execute {pm} install para instalar as dependências.',
    installFailure: 'Abra {dir} e execute {pm} install novamente.',
    formatFailure:
      'O pnpm instalou as dependências. Confira o Vite+ local e execute pnpm exec vp fmt pnpm-workspace.yaml na aplicação.',
    creating: 'Criando os arquivos da aplicação',
    gitTask: 'Inicializando o Git',
    installTask: 'Instalando as dependências com {pm}',
    dir: 'Pasta do projeto',
    title: 'Título da aplicação',
    mode: 'Modo de renderização',
    server: 'Servidor (SSR)',
    static: 'Estático',
    client: 'Só cliente (SPA)',
    i18n: 'Habilitar traduções?',
    locales: 'Idiomas separados por vírgulas',
    appLanguage: 'Idioma da aplicação',
    base: 'Idioma base',
    seo: 'Metadados de SEO',
    url: 'URL pública do site',
    theme: 'Seletor de tema claro e escuro',
    icons: 'Ícones',
    fonts: 'Fonte Inter hospedada na aplicação',
    diagnostics: 'Diagnóstico de reatividade do Solid no desenvolvimento',
    installer: 'Gerenciador de pacotes',
    git: 'Criar um repositório Git?',
    install: 'Instalar as dependências?',
    yes: 'Sim',
    no: 'Não',
    cancel: 'Criação cancelada.',
    summary: 'Configuração do projeto',
    next: 'Próximos passos',
    missingBun: 'Instale o Bun em https://bun.sh antes de executar as tarefas.',
    defaults:
      'Padrões: solid-app, nome da pasta como título, servidor no Vercel, pt/en/es (base en), todos os recursos, https://example.com, Bun, Git e instalação.',
    destination: '--name exige uma pasta nova ou vazia',
    badTitle: '--title exige texto em uma linha sem caracteres de controle',
    origin: '--site-url exige uma origem HTTP ou HTTPS',
    needsSeo: '--site-url exige SEO',
    clientSeo:
      'O modo cliente não publica metadados de SEO. Use --mode static.',
    tag: '{flag} exige um idioma BCP 47 válido: {value}',
    list: '--locales exige idiomas distintos em uma lista não vazia',
    noTranslations: '--locales é incompatível com --no-i18n',
    membership: '--base-locale precisa estar em --locales',
    clientLanguages:
      '--locales aceita um idioma no cliente. Use --mode static para vários idiomas.',
    conflict: 'Escolha --{value} ou --no-{value}.',
    invalid: 'Opção inválida: {flag}'
  },
  es: {
    setup: 'Configuración',
    recommended: 'Recomendada',
    custom: 'Personalizar',
    features: 'Funcionalidades (Espacio para marcar, Intro para continuar)',
    serverHint: 'Renderiza cada petición en Vercel (--mode server).',
    staticHint:
      'Genera HTML con SEO durante el build para alojamiento estático (--mode static).',
    clientHint:
      'El alojamiento sirve index.html en todas las rutas. Un idioma, sin SEO (--mode client).',
    bunHint: 'Recomendado. Instala dependencias y ejecuta todas las tareas.',
    installHint: 'Solo instala dependencias. Bun ejecuta todas las tareas.',
    featureList: 'Funcionalidades',
    none: 'Ninguna',
    installation: 'Instalación',
    create: '¿Crear el proyecto?',
    ready: 'Proyecto creado.',
    tagline: 'Crea una aplicación Solid independiente.',
    languages: 'Idiomas',
    manager: 'Gestor de paquetes',
    usage: `bunx @evertondgn/create-solid@latest [DIR]

Proyecto
  --name DIR                  Carpeta del proyecto
  --title TEXT                Título de la aplicación
  --mode server|static|client  Modo de renderizado

Funcionalidades
  --seo                       Publicar metadatos SEO
  --no-seo                    No publicar metadatos SEO
  --theme                     Incluir el selector de tema
  --no-theme                  No incluir el selector de tema
  --icons                     Incluir iconos
  --no-icons                  No incluir iconos
  --fonts                     Incluir la fuente Inter
  --no-fonts                  No incluir la fuente Inter
  --diagnostics               Activar el diagnóstico de reactividad de Solid
  --no-diagnostics            No activar el diagnóstico de reactividad de Solid
  --i18n                      Activar traducciones
  --no-i18n                   No activar traducciones
  --locales TAGS              Idiomas de la aplicación
  --base-locale TAG           Idioma base
  --site-url URL              URL pública del sitio

Instalación
  --pm bun|npm|pnpm           Gestor de paquetes
  --git                       Crear un repositorio Git
  --no-git                    No crear un repositorio Git
  --install                   Instalar dependencias
  --no-install                No instalar dependencias

Automatización
  --yes                       Usar los valores predeterminados y omitir la confirmación
  --no-interactive            Usar las opciones de la línea de comandos
  --lang pt-BR|en|es          Idioma del cuestionario
  --help                      Mostrar esta ayuda
  -h                          Mostrar esta ayuda`,
    automation:
      'Usa --yes para aceptar los valores predeterminados. Con --no-interactive, CI o entrada redirigida, indica el destino o usa --yes.',
    publishList: 'Consulta "Before publishing" en README.md.',
    setUrl: 'Configura VITE_SITE_URL antes de publicar.',
    seed: 'Traduce los mensajes iniciales de {tag}.',
    windows:
      'create-solid funciona en macOS y Linux. Windows no es compatible.',
    tool: 'Instala {tool} antes de generar la aplicación. {link}',
    retry: 'Volver a comprobar',
    skipInstall: 'Omitir la instalación',
    gitFailure:
      'No se pudo crear el repositorio. Abre {dir} y ejecuta git init con Git instalado o continúa sin Git. Ejecuta {pm} install para instalar las dependencias.',
    installFailure: 'Abre {dir} y ejecuta {pm} install de nuevo.',
    formatFailure:
      'pnpm instaló las dependencias. Comprueba Vite+ y ejecuta pnpm exec vp fmt pnpm-workspace.yaml en la aplicación.',
    creating: 'Creando los archivos de la aplicación',
    gitTask: 'Inicializando Git',
    installTask: 'Instalando las dependencias con {pm}',
    dir: 'Carpeta del proyecto',
    title: 'Título de la aplicación',
    mode: 'Modo de renderizado',
    server: 'Servidor (SSR)',
    static: 'Estático',
    client: 'Solo cliente (SPA)',
    i18n: '¿Activar traducciones?',
    locales: 'Idiomas separados por comas',
    appLanguage: 'Idioma de la aplicación',
    base: 'Idioma base',
    seo: 'Metadatos SEO',
    url: 'URL pública del sitio',
    theme: 'Selector de tema claro y oscuro',
    icons: 'Iconos',
    fonts: 'Fuente Inter incluida en el proyecto',
    diagnostics: 'Diagnóstico de reactividad de Solid durante el desarrollo',
    installer: 'Gestor de paquetes',
    git: '¿Crear un repositorio Git?',
    install: '¿Instalar las dependencias?',
    yes: 'Sí',
    no: 'No',
    cancel: 'Creación cancelada.',
    summary: 'Configuración del proyecto',
    next: 'Próximos pasos',
    missingBun:
      'Instala Bun desde https://bun.sh antes de ejecutar las tareas.',
    defaults:
      'Valores predeterminados: solid-app, nombre de carpeta como título, servidor en Vercel, pt/en/es (base en), todas las funcionalidades, https://example.com, Bun, Git e instalación.',
    destination: '--name requiere una carpeta nueva o vacía',
    badTitle: '--title requiere texto en una línea sin caracteres de control',
    origin: '--site-url requiere un origen HTTP o HTTPS',
    needsSeo: '--site-url requiere SEO',
    clientSeo: 'El modo cliente no publica metadatos SEO. Usa --mode static.',
    tag: '{flag} requiere un idioma BCP 47 válido: {value}',
    list: '--locales requiere idiomas distintos en una lista no vacía',
    noTranslations: '--locales es incompatible con --no-i18n',
    membership: '--base-locale debe estar en --locales',
    clientLanguages:
      '--locales acepta un idioma en el cliente. Usa --mode static para varios idiomas.',
    conflict: 'Elige --{value} o --no-{value}.',
    invalid: 'Opción no válida: {flag}'
  }
} as const

export type Language = keyof typeof messages
export type MessageKey = keyof typeof messages.en
export function message(
  language: Language,
  { code, values }: { code: MessageKey; values: Record<string, string> }
): string {
  return messages[language][code].replaceAll(
    /\{\w+\}/gu,
    match => values[match.slice(1, -1)] ?? match
  )
}
