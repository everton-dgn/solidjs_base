import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import stylelint, { type Config } from 'stylelint'

import { cssFilenameError } from '../css/css-filename.ts'
import { hasMatch } from '../has-match.ts'

type TokenProperty = [name: string, families: string[], value?: string]

type FilenameDiagnostic = {
  file: string
  message: string
}

type CssCheck = {
  report: string
  hasErrors: boolean
}

const VAR = String.raw`var\(\s*--[a-z0-9-]+\s*\)`
const TOKEN = String.raw`/^${VAR}(?:\s*[,/]\s*${VAR}|\s+${VAR})*$/`
// line-height has no token, so the font shorthand accepts a raw height.
const LINE_HEIGHT = String.raw`(?:\d*\.?\d+(?:%|[a-z]+)?|normal)`
const FONT_TOKEN = String.raw`/^${VAR}(?:\s+${VAR})*(?:\s*\/\s*(?:${LINE_HEIGHT}|${VAR})(?:\s+${VAR})*)?$/`
const TOKEN_KEYWORDS =
  '/^(?:transparent|currentcolor|inherit|initial|unset|revert|revert-layer|none|auto)$/i'
const TOKEN_FAMILIES = [
  'color',
  'gradient',
  'radius',
  'shadow',
  'ring',
  'font-size',
  'font-weight',
  'z-index'
]
// Without the matching file, Stylelint 18 throws for the whole run, so only the
// references the application has are passed.
const REFERENCE_FILES = [
  'src/theme/tokens/**/*.css',
  'src/theme/class/animation.css'
]
// The type check skips values with a var() it cannot resolve; matching by name
// reaches fallbacks and custom properties. The list has the deprecated system
// colors and the WebKit ones.
const SYSTEM_COLORS = `
  AccentColor AccentColorText ActiveText ButtonBorder ButtonFace ButtonText
  Canvas CanvasText Field FieldText GrayText Highlight HighlightText LinkText
  Mark MarkText SelectedItem SelectedItemText VisitedText
  ActiveBorder ActiveCaption AppWorkspace Background ButtonHighlight
  ButtonShadow CaptionText InactiveBorder InactiveCaption InactiveCaptionText
  InfoBackground InfoText Menu MenuText Scrollbar ThreeDDarkShadow ThreeDFace
  ThreeDHighlight ThreeDLightShadow ThreeDShadow Window WindowFrame WindowText
  -webkit-activelink -webkit-focus-ring-color -webkit-link -webkit-text
`
  .trim()
  .split(/\s+/u)
// A dot, slash or # at the edges keeps url() paths and token names out.
const SYSTEM_COLOR = String.raw`/(?<![\w#./-])(?:${SYSTEM_COLORS.join('|')})(?![\w.-])/i`
// Properties without color that take free names or text.
const NAME_PROPERTIES = String.raw`animation(?:-name)?|transition(?:-property)?|will-change|grid(?:-[a-z]+)*|container(?:-name)?|counter-(?:increment|reset|set)|view-transition-(?:class|name)|font-family|content|quotes|list-style(?:-type)?|page`
const CSS_FILES = 'src/**/*.css'

// CSS accepts property names in uppercase and with a vendor prefix.
function property(names: string): string {
  return String.raw`/^(?!--)(?:-[a-z]+-)?(?:${names})$/i`
}

const TOKEN_PROPERTIES: TokenProperty[] = [
  [property('(?:[a-z]+-)*color|fill|stroke'), ['/^--color-/']],
  [property('(?:[a-z]+-)*radius'), ['/^--radius-/']],
  [property('background'), ['/^--(?:color|gradient)-/']],
  [property('background-image'), ['/^--gradient-/']],
  [property('box-shadow'), ['/^--(?:shadow|ring)-/']],
  // There is no text shadow token: only the keywords pass.
  [property('text-shadow'), []],
  [property('font'), ['/^--font-/'], FONT_TOKEN],
  [property('font-size'), ['/^--font-size-/']],
  [property('font-weight'), ['/^--font-weight-/']],
  [property('z-index'), ['/^--z-index-/']],
  // A local custom property named after a family only passes on its tokens.
  ...TOKEN_FAMILIES.map((family): TokenProperty => [
    `/^--${family}-/`,
    [`/^--${family}-/`]
  ]),
  ['/^--font-(?!size-|weight-)/', ['/^--font-/'], FONT_TOKEN]
]

async function referenceFiles(root: string): Promise<string[]> {
  const files = await Promise.all(
    REFERENCE_FILES.map(async pattern =>
      (await hasMatch({ root, pattern })) ? [path.join(root, pattern)] : []
    )
  )
  return files.flat()
}

// The Stylelint glob skips dotfiles, node_modules and .stylelintignore; this
// walk keeps every CSS file of src/ in the filename check.
async function filenameDiagnostics(
  root: string
): Promise<FilenameDiagnostic[]> {
  const entries = await readdir(path.join(root, 'src'), {
    recursive: true,
    withFileTypes: true
  })
  return entries.flatMap(entry => {
    if (!entry.isFile()) return []
    const absolute = path.join(entry.parentPath, entry.name)
    const file = path.relative(root, absolute).split(path.sep).join('/')
    if (!file.endsWith('.css')) return []
    const message = cssFilenameError(file)
    return message ? [{ file, message }] : []
  })
}

export async function defineStylelintConfig(appRoot: string): Promise<Config> {
  // Stylelint matches globs and overrides against absolute paths.
  const root = path.resolve(appRoot)
  return {
    referenceFiles: await referenceFiles(root),
    reportDescriptionlessDisables: true,
    // The path keeps the plugin resolved from this package: by name, Stylelint
    // would look in the application and its working directory.
    plugins: [fileURLToPath(import.meta.resolve('stylelint-use-nesting'))],
    rules: {
      'property-no-unknown': true,
      'declaration-property-value-no-unknown': true,
      'value-no-invalid': true,
      'unit-no-unknown': true,
      'color-no-invalid-hex': true,
      'color-no-hex': true,
      'color-named': 'never',
      'declaration-block-no-duplicate-properties': [
        true,
        { ignore: ['consecutive-duplicates-with-different-syntaxes'] }
      ],
      'declaration-block-no-shorthand-property-overrides': true,
      'selector-pseudo-class-no-unknown': true,
      'selector-pseudo-element-no-unknown': true,
      'selector-type-no-unknown': true,
      'at-rule-no-unknown': true,
      'no-unknown-animations': true,
      'no-unknown-custom-properties': true,
      'custom-property-no-missing-var-function': true,
      'custom-property-pattern': '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$',
      'selector-no-invalid': true,
      'selector-no-deprecated': true,
      'selector-no-unmatchable': true,
      'at-charset-rule-no-invalid': true,
      'media-query-no-invalid': true,
      'media-feature-name-no-unknown': true,
      'media-feature-name-value-no-unknown': true,
      'function-calc-no-unspaced-operator': true,
      'no-invalid-position-at-import-rule': true,
      'no-duplicate-selectors': true,
      'keyframe-block-no-duplicate-selectors': true,
      'function-disallowed-list': [
        'rgb',
        'rgba',
        'hsl',
        'hsla',
        'hwb',
        'lab',
        'lch',
        'oklab',
        'oklch',
        'color',
        'color-mix',
        'light-dark',
        'contrast-color',
        'device-cmyk'
      ],
      'value-type-custom-property-required-list': [
        ['color'],
        { ignoreValues: [TOKEN_KEYWORDS] }
      ],
      'declaration-property-value-allowed-list': [
        Object.fromEntries(
          TOKEN_PROPERTIES.map(([name, , value = TOKEN]) => [
            name,
            [value, TOKEN_KEYWORDS]
          ])
        ),
        {
          message:
            'Use only var() tokens in this property; an exception needs a stylelint-disable comment with the reason.'
        }
      ],
      'declaration-property-custom-property-allowed-list': [
        Object.fromEntries(
          TOKEN_PROPERTIES.map(([name, families]) => [name, families])
        ),
        { message: 'The property "%s" does not accept the token "%s".' }
      ],
      'declaration-property-value-disallowed-list': [
        {
          [String.raw`/^(?!(?:-[a-z]+-)?(?:${NAME_PROPERTIES})$)/i`]: [
            SYSTEM_COLOR
          ]
        },
        { message: 'System colors belong in src/theme/.' }
      ],
      'selector-class-pattern': [
        '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$',
        { message: 'Use snake_case for CSS classes, as in variant_default.' }
      ],
      'max-nesting-depth': 2,
      'nesting-selector-no-missing-scoping-root': true,
      'csstools/use-nesting': 'always'
    },
    overrides: [
      {
        files: [path.join(root, 'src/theme/**/*.css')],
        rules: {
          'function-disallowed-list': [
            'rgb',
            'rgba',
            'hsl',
            'hsla',
            'hwb',
            'lab',
            'lch',
            'color'
          ],
          'value-type-custom-property-required-list': null,
          'declaration-property-value-allowed-list': null,
          'declaration-property-custom-property-allowed-list': null,
          'declaration-property-value-disallowed-list': null
        }
      }
    ]
  }
}

export async function checkCss(appRoot: string): Promise<CssCheck> {
  const root = path.resolve(appRoot)
  const config = await defineStylelintConfig(root)
  const [filenames, result] = await Promise.all([
    filenameDiagnostics(root),
    stylelint.lint({
      cwd: root,
      files: [CSS_FILES],
      config,
      formatter: 'string'
    })
  ])
  const filenameReport = filenames
    .map(
      ({ file, message }) =>
        `${file}:1 error project/css-filename: ${message}\n`
    )
    .join('')
  return {
    report: result.report + filenameReport,
    hasErrors: result.errored || filenames.length > 0
  }
}
