import path from 'node:path'
import { PassThrough, type Writable, type Readable } from 'node:stream'
import { stripVTControlCharacters } from 'node:util'

import { confirm, intro, isCancel, select, text } from '@clack/prompts'

import { messages, type Language } from './cli-language.ts'
import type { Answers } from './profile-answers.ts'
import { CanceledError } from './usage-error.ts'
import { validateProfile } from './validate-profile.ts'

function answer<T extends string | boolean>(value: T | symbol): T {
  if (isCancel(value) || typeof value === 'symbol') throw new CanceledError()
  return value
}

type Session = {
  answers: Answers
  language: Language
  input: Readable
  output: Writable
  color: boolean
}

export async function questionnaire({
  answers,
  language,
  input,
  output,
  color
}: Session): Promise<Answers> {
  const labels = messages[language]
  const plainOutput = new PassThrough()
  plainOutput.on('data', chunk =>
    output.write(stripVTControlCharacters(String(chunk)))
  )
  const io = { input, output: color ? output : plainOutput, accessible: !color }
  const result = { ...answers }
  intro(color ? '\u001B[38;2;68;107;158mSolid Base\u001B[0m' : 'Solid Base', io)
  const toggle = async (message: string) =>
    answer<boolean>(
      await confirm({ ...io, message, active: labels.yes, inactive: labels.no })
    )
  const field = async (
    key: 'name' | 'title' | 'locales' | 'base-locale' | 'site-url',
    initialValue: string
  ) => {
    const names = {
      name: labels.dir,
      title: labels.title,
      locales: labels.locales,
      'base-locale': labels.base,
      'site-url': labels.url
    }
    if (result[key] !== undefined) return
    result[key] = answer<string>(
      await text({
        ...io,
        message: names[key],
        initialValue,
        validate(value) {
          const problem = validateProfile({
            ...result,
            [key]: value ?? ''
          }).problems.find(
            item =>
              item.field.replace(/^--/u, '') ===
                (key === 'name' ? 'dir' : key) ||
              (key === 'locales' && item.code === 'membership')
          )
          return problem?.describe(language)
        }
      })
    )
  }
  await field('name', 'solid-app')
  await field('title', path.basename(path.resolve(result.name ?? 'solid-app')))
  async function chooseMode() {
    if (result.mode === undefined) {
      const modes =
        result.seo || result['site-url'] || result.locales?.includes(',')
          ? (['server', 'static'] as const)
          : (['server', 'static', 'client'] as const)
      result.mode = answer<string>(
        await select({
          ...io,
          message: labels.mode,
          showInstructions: false,
          options: modes.map(value => ({
            value,
            label: `${value} (${labels[value]})`
          }))
        })
      )
    }
  }
  async function chooseLanguages() {
    if (!result.i18n && !result['no-i18n'] && result.locales === undefined) {
      result['no-i18n'] = !(await toggle(labels.i18n))
    }
    const { defaults } = validateProfile(result)
    if (!result['no-i18n']) {
      if (result.mode === 'client' && result['base-locale'] !== undefined) {
        result.locales ??= result['base-locale']
      }
      await field(
        'locales',
        result.mode === 'client'
          ? defaults.baseLocale
          : defaults.locales.join(',')
      )
      if (result.locales && !result.locales.includes(',')) {
        result['base-locale'] ??= result.locales
      }
    }
    await field(
      'base-locale',
      answers.locales === undefined &&
        result.locales === defaults.locales.join(',')
        ? defaults.baseLocale
        : (result.locales?.split(',')[0] ?? defaults.baseLocale)
    )
  }
  await chooseMode()
  await chooseLanguages()
  for (const key of [
    'seo',
    'theme',
    'icons',
    'fonts',
    'diagnostics'
  ] as const) {
    if (key === 'seo' && result.mode === 'client') continue
    if (
      !result[key] &&
      !result[`no-${key}`] &&
      !(key === 'seo' && result['site-url'] !== undefined)
    ) {
      result[`no-${key}`] = !(await toggle(labels[key]))
    }
    if (key === 'seo' && !result['no-seo']) {
      await field('site-url', 'https://example.com')
    }
  }
  result.pm ??= answer<string>(
    await select({
      ...io,
      message: labels.installer,
      showInstructions: false,
      options: ['bun', 'npm', 'pnpm'].map(value => ({ value }))
    })
  )
  for (const key of ['git', 'install'] as const) {
    if (!result[key] && !result[`no-${key}`]) {
      result[`no-${key}`] = !(await toggle(labels[key]))
    }
  }
  return result
}
