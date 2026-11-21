import path from 'node:path'
import process from 'node:process'

import { messages, type Language } from '../cli-language.ts'
import { hasRepository, toolNames } from '../tools.ts'
import type { validateProfile } from '../validateProfile/index.ts'

type Summary = {
  validated: ReturnType<typeof validateProfile>
  language: Language
}

export function projectSummary({ validated, language }: Summary): string {
  const { profile, title, languages, siteUrl } = validated
  const m = messages[language]
  const features = [
    profile.hasSeo && 'SEO',
    profile.hasTheme && m.summaryTheme,
    profile.hasIcons && m.icons,
    profile.hasFonts && m.summaryFonts,
    profile.hasDiagnostics && m.summaryDiagnostics
  ].filter(Boolean)
  const locales = languages.locales.map(tag =>
    tag === languages.baseLocale && languages.locales.length > 1
      ? `${tag} (base)`
      : tag
  )
  const git = profile.shouldInitGit ? m.yes : m.no
  return [
    [m.dir, path.relative(process.cwd(), profile.dir) || '.'],
    [m.title, title],
    [m.mode, m[profile.mode ?? 'server']],
    [profile.hasI18n ? m.languages : m.appLanguage, locales.join(', ')],
    ...(siteUrl ? [[m.url, siteUrl.origin]] : []),
    [m.featureList, features.join(', ') || m.none],
    [m.manager, toolNames[profile.pm]],
    ['Git', hasRepository(profile.dir) ? m.existingGit : git],
    [m.installation, profile.shouldInstall ? m.yes : m.no]
  ]
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n')
}
