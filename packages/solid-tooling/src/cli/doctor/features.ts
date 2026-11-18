import { glob, readFile, stat } from 'node:fs/promises'
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
type Signal = Check & { status: 'warning' }

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
        option.key.type === 'Identifier' &&
        option.key.name === 'i18nPlugin'
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

export async function featureWarnings({
  root,
  dependencies,
  preset
}: FeatureInput): Promise<Signal[]> {
  const warnings: Signal[] = []
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
  const seen = new Set(preset.folders)
  for await (const source of glob('src/**/*.{ts,tsx,js,jsx}', { cwd: root })) {
    if (source.endsWith('.d.ts')) continue
    const absolute = path.join(root, source)
    const contents = await readFile(absolute, 'utf8')
    if (!contents.includes('icon:')) continue
    const { parse } = await import('vite-plus')
    const { module } = await parse(source, contents)
    for (const request of module.staticImports) {
      const collection = /^icon:(?<name>[a-z0-9-]+)(?:\/|$)/u.exec(
        request.moduleRequest.value
      )?.groups?.name
      if (!collection || seen.has(collection)) continue
      seen.add(collection)
      const name = `@iconify-json/${collection}`
      if (!dependencies.includes(name)) {
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

export function readPreset(value: string): Preset {
  return v.parse(presetSchema, JSON.parse(value))
}
