import path from 'node:path'

import type { Profile } from './types.ts'

export const modes = ['server', 'static', 'client'] as const
export const installers = ['bun', 'pnpm', 'npm'] as const
export const switches = [
  'i18n',
  'seo',
  'theme',
  'icons',
  'fonts',
  'diagnostics',
  'git',
  'install'
] as const

export type Answers = Partial<
  Record<
    (typeof switches)[number] | `no-${(typeof switches)[number]}` | 'no-i18n',
    boolean
  >
> &
  Partial<
    Record<
      'name' | 'title' | 'locales' | 'base-locale' | 'site-url' | 'pm' | 'mode',
      string
    >
  >

export function answerProfile(answers: Answers): Profile {
  const mode = modes.find(value => value === answers.mode) ?? 'server'
  const pm = installers.find(value => value === answers.pm) ?? 'bun'
  return {
    dir: answers.name ? path.resolve(answers.name) : '',
    mode,
    pm,
    ...(answers.title === undefined ? {} : { title: answers.title }),
    ...(answers.locales === undefined
      ? {}
      : { locales: answers.locales.split(',') }),
    ...(answers['base-locale'] === undefined
      ? {}
      : { baseLocale: answers['base-locale'] }),
    ...(answers['site-url'] === undefined
      ? {}
      : { siteUrl: answers['site-url'] }),
    hasSeo: mode === 'client' ? Boolean(answers.seo) : !answers['no-seo'],
    hasTheme: !answers['no-theme'],
    hasIcons: !answers['no-icons'],
    hasFonts: !answers['no-fonts'],
    hasDiagnostics: !answers['no-diagnostics'],
    hasI18n: !answers['no-i18n'],
    shouldInitGit: !answers['no-git'],
    shouldInstall: !answers['no-install']
  }
}
