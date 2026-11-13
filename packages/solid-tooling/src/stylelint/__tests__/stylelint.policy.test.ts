import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it, type TestContext } from 'node:test'

import stylelint from 'stylelint'

import { createAppFixture } from '../../testing/appFixture/index.ts'
import { defineStylelintConfig } from '../index.ts'

type LinterOptions = { context: TestContext; file?: string }

type Lint = (code: string) => Promise<string[]>

const TOKENS = `:root {
  --color-primary: currentcolor;
  --color-secondary: currentcolor;
  --color-foreground: currentcolor;
  --gradient-page: none;
  --radius-8: 8px;
  --ring-focus: none;
  --shadow-sm: none;
  --font-family: sans-serif;
  --font-size-14: 14px;
  --font-weight-600: 600;
}
`

// The theme has only the tokens these cases use.
async function createLinter({
  context,
  file = 'src/components/atoms/Card/styles.module.css'
}: LinterOptions): Promise<Lint> {
  const root = await createAppFixture({
    context,
    files: { 'src/theme/tokens/colors.css': TOKENS }
  })
  return async code => {
    const result = await stylelint.lint({
      cwd: root,
      code,
      codeFilename: path.join(root, file),
      config: await defineStylelintConfig(root)
    })
    return result.results.flatMap(item =>
      item.warnings.map(warning => warning.rule)
    )
  }
}

describe('stylelint css policy', () => {
  it('accepts snake_case and rejects hyphens, camelCase and PascalCase', async context => {
    const lint = await createLinter({ context })
    assert.deepEqual(
      await lint('.variant_default { color: var(--color-primary); }'),
      []
    )
    for (const selector of [
      'btn-primary',
      'btnPrimary',
      'BtnPrimary',
      'btn__primary',
      'btn_primary_'
    ]) {
      const rules = await lint(`.${selector} { color: var(--color-primary); }`)
      assert.ok(rules.includes('selector-class-pattern'))
    }
  })

  it('allows two nested levels and rejects a third', async context => {
    const lint = await createLinter({ context })
    assert.deepEqual(
      await lint(
        '.card { &:hover { & > span { color: var(--color-primary); } } }'
      ),
      []
    )
    const rules = await lint(
      '.card { &:hover { & > span { & > a { color: var(--color-primary); } } } }'
    )
    assert.ok(rules.includes('max-nesting-depth'))
  })

  it('requests nesting for adjacent state selectors and media queries', async context => {
    const lint = await createLinter({ context })
    const states = await lint(
      '.card { color: var(--color-primary); } .card:hover { color: var(--color-secondary); }'
    )
    assert.ok(states.includes('csstools/use-nesting'))
    const media = await lint(
      '.card { color: var(--color-primary); } @media (width > 600px) { .card { color: var(--color-secondary); } }'
    )
    assert.ok(media.includes('csstools/use-nesting'))
  })

  it('accepts native nesting and rejects an ampersand without a parent', async context => {
    const lint = await createLinter({ context })
    assert.deepEqual(
      await lint(
        '.card { color: var(--color-primary); &:hover { color: var(--color-secondary); } @media (width > 600px) { color: var(--color-foreground); } }'
      ),
      []
    )
    const rules = await lint('&:hover { color: var(--color-primary); }')
    assert.ok(rules.includes('nesting-selector-no-missing-scoping-root'))
  })
})

describe('stylelint token policy', () => {
  it('rejects literal colors in any property and raw font shorthands', async context => {
    const lint = await createLinter({ context })
    for (const { code, rule } of [
      { code: '.a { border-block-end: 1px solid red; }', rule: 'color-named' },
      {
        code: '.a { border-inline-start: 1px solid #f00; }',
        rule: 'color-no-hex'
      },
      {
        code: '.a { text-decoration: underline oklch(0.6 0.2 25); }',
        rule: 'function-disallowed-list'
      },
      {
        code: '.a { outline: 1px solid contrast-color(var(--color-primary)); }',
        rule: 'function-disallowed-list'
      },
      {
        code: '.a { outline: 2px solid Canvas; }',
        rule: 'value-type-custom-property-required-list'
      },
      {
        code: '.a { font: 600 14px sans-serif; }',
        rule: 'declaration-property-value-allowed-list'
      },
      {
        code: '.a { background-image: linear-gradient(var(--color-primary), var(--color-secondary)); }',
        rule: 'declaration-property-value-allowed-list'
      }
    ]) {
      const rules = await lint(code)
      assert.ok(rules.includes(rule), code)
    }
    assert.deepEqual(
      await lint('.a { font: inherit; background: currentcolor; }'),
      []
    )
  })

  it('accepts token combinations and rejects raw values between tokens', async context => {
    const lint = await createLinter({ context })
    assert.deepEqual(
      await lint(
        '.a { box-shadow: var(--ring-focus), var(--shadow-sm); font: var(--font-weight-600) var(--font-size-14)/1.5 var(--font-family); }'
      ),
      []
    )
    for (const code of [
      '.a { font: var(--font-weight-600) 14px/1 var(--font-family); }',
      '.a { border-radius: var(--radius-8) 0 0 var(--radius-8); }',
      '.a { font-size: var(--font-size-14, 14px); }'
    ]) {
      const rules = await lint(code)
      assert.ok(rules.includes('declaration-property-value-allowed-list'), code)
    }
  })

  it('accepts an exception only through a disable comment with a reason', async context => {
    const lint = await createLinter({ context })
    const disable =
      '/* stylelint-disable-next-line declaration-property-value-allowed-list'
    assert.deepEqual(
      await lint(
        `.a {\n  ${disable} -- ícone externo exige 13px */\n  font-size: 13px;\n}`
      ),
      []
    )
    const rules = await lint(`.a {\n  ${disable} */\n  font-size: 13px;\n}`)
    assert.ok(rules.includes('--report-descriptionless-disables'))
  })

  it('rejects a token from another family with a valid type', async context => {
    const lint = await createLinter({ context })
    for (const code of [
      '.a { font-size: var(--radius-8); }',
      '.a { border-radius: var(--font-size-14); }',
      '.a { z-index: var(--font-weight-600); }'
    ]) {
      const rules = await lint(code)
      assert.ok(
        rules.includes('declaration-property-custom-property-allowed-list'),
        code
      )
    }
    assert.deepEqual(
      await lint(
        '.a { box-shadow: var(--ring-focus); background: var(--gradient-page); }'
      ),
      []
    )
  })

  it('rejects system colors the type check cannot resolve', async context => {
    const lint = await createLinter({ context })
    for (const code of [
      '.a { outline: var(--width, 2px) solid Canvas; }',
      '.a { outline: 1px solid var(--color-focus, Canvas); }',
      '.a { --x: Canvas; outline: 1px solid var(--x); }'
    ]) {
      const rules = await lint(code)
      assert.ok(
        rules.includes('declaration-property-value-disallowed-list'),
        code
      )
    }
    assert.deepEqual(
      await lint(
        '@keyframes highlight { to { opacity: 0; } } .a { animation: highlight 1s; grid-area: menu; container-name: canvas; transition: background 0.2s; mask-image: url(./icons/menu.svg); content: "Menu"; }'
      ),
      []
    )
  })

  it('matches property names in any case and with a vendor prefix', async context => {
    const lint = await createLinter({ context })
    for (const { code, rule } of [
      {
        code: '.a { FONT-SIZE: 14px; }',
        rule: 'declaration-property-value-allowed-list'
      },
      {
        code: '.a { -webkit-box-shadow: 0 0 4px 2px; }',
        rule: 'declaration-property-value-allowed-list'
      },
      {
        code: '.a { FONT-SIZE: var(--radius-8); }',
        rule: 'declaration-property-custom-property-allowed-list'
      }
    ]) {
      const rules = await lint(code)
      assert.ok(rules.includes(rule), code)
    }
  })

  it('limits local custom properties named after a token family', async context => {
    const lint = await createLinter({ context })
    assert.deepEqual(await lint('.a { --button-radius: 0; }'), [])
    assert.deepEqual(
      await lint(
        '.a { --radius-button: var(--radius-8); border-radius: var(--radius-button); }'
      ),
      []
    )
    for (const { code, rule } of [
      {
        code: '.a { --radius-button: 0; }',
        rule: 'declaration-property-value-allowed-list'
      },
      {
        code: '.a { --font-size-14: 13px; font-size: var(--font-size-14); }',
        rule: 'declaration-property-value-allowed-list'
      },
      {
        code: '.a { --button-radius: 0; border-radius: var(--button-radius); }',
        rule: 'declaration-property-custom-property-allowed-list'
      },
      {
        code: '.a { --x: 0 0 2px; text-shadow: var(--x); }',
        rule: 'declaration-property-custom-property-allowed-list'
      }
    ]) {
      const rules = await lint(code)
      assert.ok(rules.includes(rule), code)
    }
  })
})

describe('stylelint value and selector checks', () => {
  it('rejects values that cannot be parsed', async context => {
    const lint = await createLinter({ context })
    const rules = await lint('.a { inset-block-start: calc(1px + 2); }')
    assert.ok(rules.includes('value-no-invalid'))
  })

  it('rejects deprecated and unmatchable selectors and a late @charset', async context => {
    const lint = await createLinter({ context })
    for (const { code, rule } of [
      {
        code: '.a:focus-ring { color: var(--color-primary); }',
        rule: 'selector-no-deprecated'
      },
      {
        code: ':is(::before) { color: var(--color-primary); }',
        rule: 'selector-no-unmatchable'
      },
      {
        code: '.a { color: var(--color-primary); } @charset "utf-8";',
        rule: 'at-charset-rule-no-invalid'
      }
    ]) {
      const rules = await lint(code)
      assert.ok(rules.includes(rule), code)
    }
  })

  it('rejects unknown pseudo-elements and type selectors', async context => {
    const lint = await createLinter({ context })
    const pseudoElement = await lint(
      '.a { &::placholder { color: var(--color-primary); } }'
    )
    assert.ok(pseudoElement.includes('selector-pseudo-element-no-unknown'))
    const type = await lint('dvi.a { color: var(--color-primary); }')
    assert.ok(type.includes('selector-type-no-unknown'))
    assert.deepEqual(
      await lint(
        '.a { &::placeholder { color: var(--color-primary); } & svg { fill: currentcolor; } }'
      ),
      []
    )
  })
})

describe('stylelint theme exception', () => {
  it('allows color functions inside src/theme/ only', async context => {
    const code = ':root { --color-accent: oklch(0.6 0.2 25); }'
    const lintTheme = await createLinter({
      context,
      file: 'src/theme/tokens/accent.css'
    })
    assert.deepEqual(await lintTheme(code), [])
    const lint = await createLinter({ context })
    const rules = await lint(code)
    assert.ok(rules.includes('function-disallowed-list'))
  })
})
