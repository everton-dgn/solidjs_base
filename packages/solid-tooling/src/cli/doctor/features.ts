import { glob, readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

import * as v from 'valibot'

import type { Check, Preset } from './types.ts'

const strings = v.array(v.string())
const presetSchema = v.object({
  isI18nDisabled: v.boolean(),
  folders: strings,
  tasks: strings
})
type FeatureInput = { root: string; dependencies: string[]; preset?: Preset }

// A direct invocation cannot evaluate a broken config. Only a literal option
// whose value is not overridden by a later spread establishes disablement.
async function isI18nPluginDisabled(root: string): Promise<boolean> {
  const config = path.join(root, 'vite.config.ts')
  try {
    const source = await readFile(config, 'utf8')
    const { parse } = await import('vite-plus')
    const { program } = await parse(config, source)
    const statement = program.body.find(
      item => item.type === 'ExportDefaultDeclaration'
    )
    const call = statement?.declaration
    if (
      call?.type !== 'CallExpression' ||
      call.callee.type !== 'Identifier' ||
      call.callee.name !== 'defineSolidApp'
    ) {
      return false
    }
    const [options] = call.arguments
    if (options?.type !== 'ObjectExpression') return false
    for (const option of options.properties.toReversed()) {
      if (option.type === 'SpreadElement' || option.computed) return false
      if (
        (option.key.type === 'Identifier' &&
          option.key.name === 'i18nPlugin') ||
        (option.key.type === 'Literal' && option.key.value === 'i18nPlugin')
      ) {
        return option.value.type === 'Literal' && option.value.value === false
      }
    }
  } catch {
    // Missing config or parser leaves only the signal from the settings file.
    return false
  }
  return false
}

type IconInput = FeatureInput & { preset: Preset }
async function iconChecks({
  root,
  dependencies,
  preset
}: IconInput): Promise<Check[]> {
  const warnings: Check[] = []
  const file = path.join(root, 'package.json')
  const { resolve } = createRequire(file)
  function resolves(specifier: string): boolean {
    try {
      resolve(specifier)
      return true
    } catch {
      return false
    }
  }
  let catalog: unknown
  try {
    catalog = JSON.parse(
      await readFile(resolve('@iconify/json/collections.json'), 'utf8')
    )
  } catch {
    // Without local catalog metadata, unknown names may refer to local folders.
  }
  const seen = new Set(preset.folders)
  for await (const source of glob('src/**/*.{ts,tsx,js,jsx}', { cwd: root })) {
    if (source.endsWith('.d.ts')) continue
    const absolute = path.join(root, source)
    let contents: string
    try {
      contents = await readFile(absolute, 'utf8')
    } catch (error) {
      warnings.push({
        id: 'application-source',
        package: root,
        file: absolute,
        source: root,
        expected: 'readable source file',
        observed: String(error),
        status: 'error',
        fix: 'Check the source file permissions.'
      })
      continue
    }
    if (!contents.includes('icon:')) continue
    const { parse } = await import('vite-plus')
    const { module } = await parse(source, contents)
    for (const request of module.staticImports) {
      const collection = /^icon:(?<name>[a-z0-9-]+)(?:\/|$)/u.exec(
        request.moduleRequest.value
      )?.groups?.name
      if (
        !collection ||
        seen.has(collection) ||
        seen.has(request.moduleRequest.value)
      ) {
        continue
      }
      seen.add(request.moduleRequest.value)
      const name = `@iconify-json/${collection}`
      if (
        !dependencies.includes(name) &&
        catalog !== null &&
        typeof catalog === 'object' &&
        Object.hasOwn(catalog, collection)
      ) {
        if (resolves(`${name}/icons.json`)) continue
        if (
          request.moduleRequest.value.includes('/') &&
          resolves(`@iconify/json/json/${collection}.json`)
        ) {
          continue
        }
        seen.add(collection)
        warnings.push({
          id: 'icon-collection',
          package: name,
          source: absolute,
          file,
          expected: 'declared Iconify collection',
          observed: request.moduleRequest.value,
          fix: `Declare ${name} or configure a local folder.`,
          status: 'warning'
        })
      }
    }
  }
  return warnings
}

export async function featureWarnings({
  root,
  dependencies,
  preset
}: FeatureInput): Promise<Check[]> {
  const warnings: Check[] = []
  const file = path.join(root, 'package.json')
  const settings = path.join(root, 'project.inlang/settings.json')
  const isDisabled = preset?.isI18nDisabled === true
  if (
    !isDisabled &&
    !dependencies.includes('@inlang/paraglide-js') &&
    (await stat(settings, { throwIfNoEntry: false })) &&
    (preset !== undefined || !(await isI18nPluginDisabled(root)))
  ) {
    warnings.push({
      id: 'i18n-dependency',
      package: '@inlang/paraglide-js',
      source: settings,
      file,
      expected: 'declared for active i18n',
      observed: 'settings present',
      fix: 'Check whether i18n is enabled before adding Paraglide.',
      status: 'warning'
    })
  }
  // Only a loaded preset can distinguish local collections from Iconify.
  if (!preset) return warnings
  return [...warnings, ...(await iconChecks({ root, dependencies, preset }))]
}
export function readPreset(value: string): Preset {
  return v.parse(presetSchema, JSON.parse(value))
}
