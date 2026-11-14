import { mkdir, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

type Messages = Record<string, string>
type MessagesOptions = { root: string; messages: Messages }
type SettingsOptions = {
  root: string
  baseLocale: string
  locales: readonly string[]
}

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../../..')
const COMPILER_CONFIG = `import settings from './settings.json'
export default {
  outdir: './paraglide',
  emitTsDeclarations: true,
  outputStructure: 'message-modules',
  strategy: ['url', 'cookie', 'preferredLanguage', 'baseLocale'],
  cookieName: 'locale',
  cookieSameSite: 'lax',
  cookieSecure: 'auto',
  trailingSlash: 'never',
  urlPatterns: [
    { pattern: '/', localized: settings.locales.map(locale => [locale, '/' + locale]) },
    { pattern: '/:path(.*)?', localized: settings.locales.map(locale => [locale, '/' + locale + '/:path(.*)?']) }
  ],
  lazyUrlPatternPolyfill: true,
  emitReadme: false,
  emitPrettierIgnore: false
}
`
const NODE_MODULES = path.join(PROJECT_ROOT, 'node_modules')

export const LOCALES = ['de', 'fr', 'it']

export async function writeMessages({
  root,
  messages
}: MessagesOptions): Promise<void> {
  const directory = path.join(root, 'src/routes/Home/i18n')
  await mkdir(directory, { recursive: true })
  for (const locale of LOCALES) {
    await writeFile(
      path.join(directory, `${locale}.json`),
      JSON.stringify(messages)
    )
  }
}

export async function writeSettings({
  root,
  baseLocale,
  locales
}: SettingsOptions): Promise<void> {
  await writeFile(
    path.join(root, 'project.inlang/settings.json'),
    JSON.stringify({
      baseLocale,
      locales,
      modules: ['./node_modules/@inlang/plugin-message-format/dist/index.js'],
      'plugin.inlang.messageFormat': {
        pathPattern: './.paraglide/messages/{locale}.json'
      }
    })
  )
}

export async function writeProject({
  root,
  messages
}: MessagesOptions): Promise<void> {
  await mkdir(path.join(root, 'project.inlang'))
  await writeFile(
    path.join(root, 'project.inlang/paraglide.config.ts'),
    COMPILER_CONFIG
  )
  await symlink(NODE_MODULES, path.join(root, 'node_modules'))
  await writeSettings({ root, baseLocale: 'de', locales: LOCALES })
  await writeMessages({ root, messages })
}
