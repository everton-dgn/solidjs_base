import path from 'node:path'
import type { Writable, Readable } from 'node:stream'

import {
  type CommonOptions,
  confirm,
  intro,
  isCancel,
  log,
  multiselect,
  select,
  text
} from '@clack/prompts'

import manifest from '../package.json' with { type: 'json' }
import { messages, type Language } from './cli-language.ts'
import { fieldMessage } from './field-messages.ts'
import { installers } from './profile-answers.ts'
import { hasTool, hasRepository, missingTool } from './tools.ts'
import type { Answers } from './types.ts'
import { CanceledError } from './usage-error.ts'
import { validateProfile } from './validateProfile/index.ts'

function answer<T extends string | boolean | string[]>(value: T | symbol): T {
  if (isCancel(value) || typeof value === 'symbol') throw new CanceledError()
  return value
}

type Session = {
  answers: Answers
  language: Language
  input: Readable
  output: Writable & { hasColors?: (count: number) => boolean }
  hasColor: boolean
}

type SetupRecovery = { result: Answers; language: Language; io: CommonOptions }
async function recoverSetup({ result, language, io }: SetupRecovery) {
  const labels = messages[language]
  while (!result['no-git'] && !hasRepository(result.name) && !hasTool('git')) {
    result['no-git'] = !answer<boolean>(
      await confirm({
        ...io,
        message: missingTool('git', language),
        active: labels.retry,
        inactive: labels.withoutGit
      })
    )
    if (result['no-git']) delete result.git
  }
  while (!result['no-install']) {
    const manager = installers.find(pm => pm === result.pm) ?? 'bun'
    if (hasTool(manager)) break
    const selected = answer<string>(
      await select({
        ...io,
        message: missingTool(manager, language),
        options: [
          ...installers.map(value => ({
            value,
            label: hasTool(value) ? value : `${value} · ${labels.unavailable}`
          })),
          { value: 'skip', label: labels.skipInstall }
        ]
      })
    )
    if (selected === 'skip') {
      result['no-install'] = true
      delete result.install
    } else result.pm = selected
  }
}

export async function questionnaire({
  answers,
  language,
  input,
  output,
  hasColor
}: Session): Promise<Answers> {
  const labels = messages[language]
  const io = { input, output }
  const result = { ...answers }
  const solidBlue = output.hasColors?.(2 ** 24)
    ? '\u001B[38;2;68;107;158m'
    : '\u001B[38;5;67m'
  intro(
    `${hasColor ? `${solidBlue}Solid Base\u001B[0m` : 'Solid Base'} v${manifest.version}`,
    io
  )
  io.output.write(`│  ${labels.tagline}\n`)
  const availableManagers = new Set(installers.filter(tool => hasTool(tool)))
  function reportMissingTools() {
    const requestedManager = installers.find(pm => pm === result.pm) ?? 'bun'
    if (!availableManagers.has('bun')) log.warn(labels.missingBun, io)
    if (
      requestedManager !== 'bun' &&
      !availableManagers.has(requestedManager) &&
      !result['no-install']
    ) {
      log.warn(missingTool(requestedManager, language), io)
    }
    if (!result['no-git'] && !hasRepository(result.name) && !hasTool('git')) {
      log.warn(missingTool('git', language), io)
    }
  }
  reportMissingTools()
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
      locales: result.mode === 'client' ? labels.appLanguage : labels.locales,
      'base-locale': result['no-i18n'] ? labels.appLanguage : labels.base,
      'site-url': labels.url
    }
    if (result[key] !== undefined) return
    result[key] = answer<string>(
      await text({
        ...io,
        message: names[key],
        placeholder: initialValue,
        defaultValue: initialValue,
        validate(value) {
          const problem = validateProfile({
            ...result,
            [key]: value === '' ? initialValue : (value ?? initialValue)
          }).problems.find(
            item =>
              item.field.replace(/^--/u, '') ===
                (key === 'name' ? 'dir' : key) ||
              (key === 'locales' && item.code === 'membership')
          )
          return problem && fieldMessage(language, problem.code, problem.values)
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
            label: labels[value],
            hint: labels[`${value}Hint`]
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
    if (result.mode === 'client') {
      const key = result['no-i18n'] ? 'base-locale' : 'locales'
      if (key === 'locales' && result['base-locale'])
        result.locales ??= result['base-locale']
      if (!result[key]) io.output.write(`│  ${labels.singleLanguage}\n`)
      await field(key, defaults.baseLocale)
      if (result.locales) result['base-locale'] ??= result.locales
      return
    }
    if (!result['no-i18n']) {
      await field('locales', defaults.locales.join(','))
      if (result.locales && !result.locales.includes(',')) {
        result['base-locale'] ??= result.locales
      }
    }
    if (result['no-i18n']) {
      await field('base-locale', defaults.baseLocale)
    } else if (!result['base-locale']) {
      const { locales, baseLocale } = validateProfile(result).languages
      result['base-locale'] = answer<string>(
        await select({
          ...io,
          message: labels.base,
          showInstructions: false,
          initialValue:
            result.locales === defaults.locales.join(',')
              ? defaults.baseLocale
              : baseLocale,
          options: locales.map(value => ({ value }))
        })
      )
    }
  }
  async function chooseFeatures() {
    const keys = (
      ['seo', 'theme', 'icons', 'fonts', 'diagnostics'] as const
    ).filter(
      key =>
        result[key] === undefined &&
        result[`no-${key}`] === undefined &&
        (key !== 'seo' ||
          (result.mode !== 'client' && result['site-url'] === undefined))
    )
    if (keys.length > 0) {
      io.output.write(`│  ${labels.featureKeys}\n`)
      const chosen = answer<string[]>(
        await multiselect({
          ...io,
          message: labels.features,
          required: false,
          showInstructions: false,
          initialValues: keys,
          options: keys.map(value => ({
            value,
            label: labels[value],
            ...(value === 'fonts' ? { hint: labels.fontHint } : {})
          }))
        })
      )
      for (const key of keys) result[`no-${key}`] = !chosen.includes(key)
    }
    if (result.mode !== 'client' && !result['no-seo']) {
      await field('site-url', 'https://example.com')
    }
  }
  async function customize() {
    await chooseFeatures()
    await chooseLanguages()
    result.pm ??= answer<string>(
      await select({
        ...io,
        message: labels.installer,
        showInstructions: false,
        options: installers.map(value => {
          const hint = value === 'bun' ? labels.bunHint : labels.installHint
          return {
            value,
            label: availableManagers.has(value)
              ? value
              : `${value} · ${labels.unavailable}`,
            hint
          }
        })
      })
    )
    for (const key of ['git', 'install'] as const) {
      if (!result[key] && !result[`no-${key}`]) {
        result[`no-${key}`] = !(await toggle(labels[key]))
      }
    }
  }
  await chooseMode()
  const setup = answer(
    await select({
      ...io,
      message: labels.setup,
      showInstructions: false,
      options: [
        { value: 'recommended', label: labels.recommended },
        { value: 'custom', label: labels.custom }
      ]
    })
  )
  if (setup === 'custom') await customize()
  await recoverSetup({ result, language, io })
  return result
}
