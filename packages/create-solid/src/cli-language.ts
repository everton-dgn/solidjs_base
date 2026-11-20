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
    languages: 'Languages',
    manager: 'Installer',
    usage:
      'bunx @evertondgn/create-solid@latest [DIR] [--pm bun|pnpm|npm] [--title TEXT] [--i18n|--no-i18n] [--locales TAGS] [--base-locale TAG] [--site-url URL] [--mode server|static|client] [--seo|--no-seo] [--theme|--no-theme] [--icons|--no-icons] [--fonts|--no-fonts] [--diagnostics|--no-diagnostics] [--no-git] [--no-install] [--name DIR] [--git] [--install] [--yes] [--no-interactive] [--lang pt-BR|en|es]',
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
    server: 'Render on Vercel',
    static: 'File host with directory indexes and per-page headers',
    client: 'File host with an HTML fallback',
    i18n: 'Enable translations?',
    locales: 'Language tags, separated by commas',
    appLanguage: 'Application language',
    base: 'Base language',
    seo: 'Publish SEO metadata?',
    url: 'Public site origin',
    theme: 'Include theme controls?',
    icons: 'Include icons?',
    fonts: 'Include bundled fonts?',
    diagnostics: 'Enable development diagnostics?',
    installer:
      'Choose the installer. Bun runs every task. npm and pnpm only install dependencies.',
    git: 'Initialize Git?',
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
    languages: 'Idiomas',
    manager: 'Instalador',
    usage:
      'bunx @evertondgn/create-solid@latest [PASTA] [--pm bun|pnpm|npm] [--title TEXTO] [--i18n|--no-i18n] [--locales IDIOMAS] [--base-locale TAG] [--site-url URL] [--mode server|static|client] [--seo|--no-seo] [--theme|--no-theme] [--icons|--no-icons] [--fonts|--no-fonts] [--diagnostics|--no-diagnostics] [--no-git] [--no-install] [--name PASTA] [--git] [--install] [--yes] [--no-interactive] [--lang pt-BR|en|es]',
    automation:
      'Use --yes para aceitar os padrões. Com --no-interactive, CI ou entrada redirecionada, informe o destino ou use --yes.',
    publishList: 'Consulte "Before publishing" no README.md.',
    setUrl: 'Defina VITE_SITE_URL antes de publicar.',
    seed: 'Traduza as mensagens iniciais de {tag}.',
    windows: 'Use o create-solid no macOS ou no Linux.',
    tool: 'Instale {tool} antes de gerar a aplicação. {link}',
    retry: 'Verificar novamente',
    skipInstall: 'Pular a instalação',
    gitFailure:
      'Falha ao inicializar o Git. Abra {dir} e execute git init. Para instalar as dependências, execute {pm} install.',
    installFailure: 'Abra {dir} e execute {pm} install novamente.',
    formatFailure:
      'O pnpm instalou as dependências. Confira o Vite+ local e execute pnpm exec vp fmt pnpm-workspace.yaml na aplicação.',
    creating: 'Criando os arquivos da aplicação',
    gitTask: 'Inicializando o Git',
    installTask: 'Instalando as dependências com {pm}',
    dir: 'Pasta do projeto',
    title: 'Título da aplicação',
    mode: 'Modo de renderização',
    server: 'Renderização no Vercel',
    static:
      'Hospedagem de arquivos com índices de diretório e cabeçalhos por página',
    client: 'Hospedagem de arquivos com fallback para HTML',
    i18n: 'Habilitar traduções?',
    locales: 'Idiomas separados por vírgulas',
    appLanguage: 'Idioma da aplicação',
    base: 'Idioma base',
    seo: 'Publicar metadados de SEO?',
    url: 'Origem pública do site',
    theme: 'Incluir controles de tema?',
    icons: 'Incluir ícones?',
    fonts: 'Incluir fontes locais?',
    diagnostics: 'Habilitar diagnóstico em desenvolvimento?',
    installer:
      'Escolha o instalador. O Bun executa todas as tarefas. npm e pnpm só instalam as dependências.',
    git: 'Inicializar o Git?',
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
    clientSeo: 'SEO exige renderização no servidor ou --mode static.',
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
    languages: 'Idiomas',
    manager: 'Instalador',
    usage:
      'bunx @evertondgn/create-solid@latest [CARPETA] [--pm bun|pnpm|npm] [--title TEXTO] [--i18n|--no-i18n] [--locales IDIOMAS] [--base-locale TAG] [--site-url URL] [--mode server|static|client] [--seo|--no-seo] [--theme|--no-theme] [--icons|--no-icons] [--fonts|--no-fonts] [--diagnostics|--no-diagnostics] [--no-git] [--no-install] [--name CARPETA] [--git] [--install] [--yes] [--no-interactive] [--lang pt-BR|en|es]',
    automation:
      'Usa --yes para aceptar los valores predeterminados. Con --no-interactive, CI o entrada redirigida, indica el destino o usa --yes.',
    publishList: 'Consulta "Before publishing" en README.md.',
    setUrl: 'Configura VITE_SITE_URL antes de publicar.',
    seed: 'Traduce los mensajes iniciales de {tag}.',
    windows: 'Usa create-solid en macOS o Linux.',
    tool: 'Instala {tool} antes de generar la aplicación. {link}',
    retry: 'Volver a comprobar',
    skipInstall: 'Omitir la instalación',
    gitFailure:
      'Falló la inicialización de Git. Abre {dir} y ejecuta git init. Para instalar las dependencias, ejecuta {pm} install.',
    installFailure: 'Abre {dir} y ejecuta {pm} install de nuevo.',
    formatFailure:
      'pnpm instaló las dependencias. Comprueba Vite+ y ejecuta pnpm exec vp fmt pnpm-workspace.yaml en la aplicación.',
    creating: 'Creando los archivos de la aplicación',
    gitTask: 'Inicializando Git',
    installTask: 'Instalando las dependencias con {pm}',
    dir: 'Carpeta del proyecto',
    title: 'Título de la aplicación',
    mode: 'Modo de renderizado',
    server: 'Renderizado en Vercel',
    static:
      'Alojamiento de archivos con índices de directorio y cabeceras por página',
    client: 'Alojamiento de archivos con redirección a HTML',
    i18n: '¿Activar traducciones?',
    locales: 'Idiomas separados por comas',
    appLanguage: 'Idioma de la aplicación',
    base: 'Idioma base',
    seo: '¿Publicar metadatos SEO?',
    url: 'Origen público del sitio',
    theme: '¿Incluir controles de tema?',
    icons: '¿Incluir iconos?',
    fonts: '¿Incluir fuentes locales?',
    diagnostics: '¿Activar el diagnóstico en desarrollo?',
    installer:
      'Elige el instalador. Bun ejecuta todas las tareas. npm y pnpm solo instalan las dependencias.',
    git: '¿Inicializar Git?',
    install: '¿Instalar las dependencias?',
    yes: 'Sí',
    no: 'No',
    cancel: 'Creación cancelada.',
    summary: 'Configuración del proyecto',
    next: 'Próximos pasos',
    missingBun:
      'Instala Bun desde https://bun.sh antes de ejecutar las tareas.',
    defaults:
      'Valores predeterminados: solid-app, nombre de carpeta como título, servidor en Vercel, pt/en/es (base en), todas las funciones, https://example.com, Bun, Git e instalación.',
    destination: '--name requiere una carpeta nueva o vacía',
    badTitle: '--title requiere texto en una línea sin caracteres de control',
    origin: '--site-url requiere un origen HTTP o HTTPS',
    needsSeo: '--site-url requiere SEO',
    clientSeo: 'SEO requiere renderizado en servidor o --mode static.',
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
