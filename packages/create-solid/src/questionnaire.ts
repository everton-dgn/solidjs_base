import path from 'node:path'
import { PassThrough, type Writable, type Readable } from 'node:stream'
import { stripVTControlCharacters } from 'node:util'

import {
  confirm,
  intro,
  isCancel,
  multiselect,
  select,
  text
} from '@clack/prompts'

import { messages, type Language } from './cli-language.ts'
import { installers, type Answers } from './profile-answers.ts'
import { hasTool, missingTool } from './tools.ts'
import { CanceledError } from './usage-error.ts'
import { validateProfile } from './validate-profile.ts'

function answer<T extends string | boolean | string[]>(value: T | symbol): T {
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
  const availableManagers = new Set(installers.filter(tool => hasTool(tool)))
  function reportMissingTools() {
    const requestedManager = installers.find(pm => pm === result.pm) ?? 'bun'
    if (!availableManagers.has('bun')) output.write(`${labels.missingBun}\n`)
    if (
      requestedManager !== 'bun' &&
      !availableManagers.has(requestedManager) &&
      !result['no-install']
    ) {
      output.write(`${missingTool(requestedManager, language)}\n`)
    }
    if (!result['no-git'] && !hasTool('git')) {
      output.write(`${missingTool('git', language)}\n`)
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
      locales: labels.locales,
      'base-locale': labels.base,
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
      const chosen = answer<string[]>(
        await multiselect({
          ...io,
          message: labels.features,
          required: false,
          showInstructions: false,
          initialValues: keys,
          options: keys.map(value => ({ value, label: labels[value] }))
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
        options: installers.map(value => ({
          value,
          ...(availableManagers.has(value)
            ? {}
            : { hint: missingTool(value, language) })
        }))
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
  async function recoverSetup() {
    while (!result['no-git'] && !hasTool('git')) {
      result['no-git'] = !answer<boolean>(
        await confirm({
          ...io,
          message: missingTool('git', language),
          active: labels.retry,
          inactive: labels.no
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
            ...installers.map(value => ({ value })),
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
  await recoverSetup()
  return result
}
