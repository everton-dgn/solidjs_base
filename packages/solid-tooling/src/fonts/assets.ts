import { createHash } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'

import * as v from 'valibot'

import type {
  FontAsset,
  FontAssets,
  FontOptions,
  FontPreload
} from './types.ts'

type AssetOptions = FontOptions & { base: string; assetsDir: string }
type BaseOptions = Pick<AssetOptions, 'base' | 'ssr'>
type FontUrls = {
  css: (fileName: string) => string
  html: (fileName: string) => string
}
const RELATIVE_BASE = './'
// WHY: a browser also reads %2e%2e, or dots split by a tab or a line break,
// as '..'. Resolving the URL catches the forms this pattern misses.
const PARENT_SEGMENT = /^(?:\.|%2e){2}$/iu
const URL_IGNORED = /[\t\n\r]/gu
const OUTPUT_URL = 'file:///output/'
const HASH_LENGTH = 16
const MAX_WEIGHT = 1000
const FORMATS: Record<string, string | undefined> = {
  '.woff2': 'woff2',
  '.woff': 'woff',
  '.ttf': 'truetype',
  '.otf': 'opentype'
}
const numericWeight = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(MAX_WEIGHT)
)
const textWeight = v.pipe(
  v.string(),
  v.regex(/^(?:normal|bold|(?:[1-9]\d{0,2}|1000)(?: (?:[1-9]\d{0,2}|1000))?)$/u)
)
const weightSchema = v.union([numericWeight, textWeight])
const unicodeSchema = v.pipe(
  v.string(),
  v.regex(
    /^U\+[\dA-F?]{1,6}(?:-[\dA-F]{1,6})?(?:\s*,\s*U\+[\dA-F?]{1,6}(?:-[\dA-F]{1,6})?)*$/iu
  )
)
const fontSchema = v.strictObject({
  path: v.pipe(v.string(), v.nonEmpty()),
  weight: v.optional(weightSchema, 'normal'),
  style: v.optional(v.picklist(['normal', 'italic', 'oblique']), 'normal'),
  display: v.optional(
    v.picklist(['auto', 'block', 'swap', 'fallback', 'optional']),
    'swap'
  ),
  unicodeRange: v.optional(unicodeSchema),
  preload: v.optional(v.boolean(), false)
})
const familyName = v.pipe(
  v.string(),
  v.nonEmpty(),
  v.check(
    value => !/\p{Cc}/u.test(value),
    'Font families cannot contain control characters.'
  )
)
const fileList = v.pipe(v.array(fontSchema), v.minLength(1))
const familySchema = v.strictObject({ family: familyName, files: fileList })
const familiesSchema = v.array(familySchema)

function hash(source: Uint8Array | string): string {
  return createHash('sha256').update(source).digest('hex').slice(0, HASH_LENGTH)
}

function cssString(value: string): string {
  return `"${value.replaceAll('\\', String.raw`\\`).replaceAll('"', String.raw`\"`)}"`
}

function isInside(root: string, file: string): boolean {
  const relative = path.relative(root, file)
  return (
    relative !== '' &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  )
}

// In a client build Vite keeps './' and turns '' into './'; it warns about any
// other base that starts with '.' and uses '/', so './' is the only relative
// base that reaches the plugin.
function isRelativeBase({ base, ssr }: BaseOptions): boolean {
  if (base !== RELATIVE_BASE) return false
  if (ssr !== false) {
    throw new Error('defineSolidApp fonts: a relative base needs ssr: false.')
  }
  return true
}

function fontUrls({ base, ssr }: BaseOptions): FontUrls {
  if (isRelativeBase({ base, ssr })) {
    return {
      // INVARIANT: the fonts and the stylesheet share assetsDir, so a URL
      // relative to the stylesheet is the file name.
      css: fileName => path.posix.basename(fileName),
      html: fileName => `${RELATIVE_BASE}${fileName}`
    }
  }
  if (!base.startsWith('/') || base.startsWith('//') || /[?#]/u.test(base)) {
    throw new Error(
      'defineSolidApp fonts: base must be a same-origin absolute pathname.'
    )
  }
  const url = (fileName: string): string =>
    `${base.replace(/\/$/u, '')}/${fileName}`
  return { css: url, html: url }
}

export async function readFontAssets({
  root,
  fonts,
  base,
  assetsDir,
  ssr
}: AssetOptions): Promise<FontAssets> {
  const urls = fontUrls({ base, ssr })
  if (
    path.isAbsolute(assetsDir) ||
    assetsDir
      .split(/[\\/]/u)
      .some(segment =>
        PARENT_SEGMENT.test(segment.replaceAll(URL_IGNORED, ''))
      ) ||
    !new URL(`${OUTPUT_URL}${assetsDir}/file`).href.startsWith(OUTPUT_URL)
  ) {
    throw new Error(
      'defineSolidApp fonts: assetsDir must stay inside the client output.'
    )
  }
  const families = v.parse(familiesSchema, fonts)
  const directory = await realpath(root)
  const assets = new Map<string, FontAsset>()
  const files = new Set<string>()
  const preloads = new Map<string, FontPreload>()
  const rules: string[] = []
  for (const { family, files: faces } of families) {
    for (const face of faces) {
      if (path.isAbsolute(face.path) || /[?#]/u.test(face.path)) {
        throw new Error(
          `defineSolidApp fonts: ${face.path} must be relative to the application root, without a query or fragment.`
        )
      }
      const file = await realpath(path.resolve(directory, face.path))
      if (!isInside(directory, file)) {
        throw new Error(
          `defineSolidApp fonts: ${face.path} must stay inside the application root.`
        )
      }
      const extension = path.extname(file)
      const format = FORMATS[extension]
      if (!format) {
        throw new Error(
          `defineSolidApp fonts: ${face.path} must be a woff2, woff, ttf or otf file.`
        )
      }
      const source = await readFile(file)
      // Both build environments derive the same names from the same bytes.
      // Emitting assets directly also keeps even tiny fonts out of data URLs.
      const key = `${hash(source)}${extension}`
      let asset = assets.get(key)
      if (!asset) {
        const name = path.basename(file, extension).replaceAll(/[^\w-]/gu, '_')
        asset = {
          fileName: path.posix.join(assetsDir, `${name}-${key}`),
          source,
          type: `font/${extension.slice(1)}`
        }
        assets.set(key, asset)
      }
      files.add(file)
      const href = urls.html(asset.fileName)
      if (face.preload) preloads.set(href, { href, type: asset.type })
      rules.push(
        `@font-face {\n  font-family: ${cssString(family)};\n  font-style: ${face.style};\n  font-display: ${face.display};\n  font-weight: ${face.weight};\n  src: url(${cssString(urls.css(asset.fileName))}) format(${cssString(format)});${face.unicodeRange ? `\n  unicode-range: ${face.unicodeRange};` : ''}\n}`
      )
    }
  }
  const source = `${rules.join('\n\n')}\n`
  const fileName = path.posix.join(assetsDir, `solid-fonts-${hash(source)}.css`)
  return {
    assets: [...assets.values(), { fileName, source, type: 'text/css' }],
    files: [...files],
    stylesheet: urls.html(fileName),
    preloads: [...preloads.values()]
  }
}
