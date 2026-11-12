import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'node:test'

import { RuleTester } from 'vite-plus/lint/plugins-dev'

import plugin from '../../project-plugin.ts'
import { cssFilenameError } from '../css-filename.ts'

const ROOT = path.resolve(import.meta.dirname, '../../..')

describe('css filenames', () => {
  it('checks theme boundaries and module names', () => {
    for (const file of [
      'src/routes/styles.module.css',
      'src/theme/tokens/zIndex.css'
    ]) {
      assert.equal(cssFilenameError(file), undefined)
    }
    for (const file of [
      'src/routes/home.module.css',
      'src/theme/tokens/z-index.css',
      'src/themeOther/colors.css'
    ]) {
      assert.ok(cssFilenameError(file))
    }
  })
  it('checks imports, reexports and dynamic imports through the Oxlint rule', () => {
    const rule = plugin.rules['css-filename']
    assert.ok(rule)
    new RuleTester({ cwd: ROOT }).run('css-filename', rule, {
      valid: [
        'import S from "@/routes/styles.module.css"',
        'import "/src/theme/tokens/zIndex.css"',
        'import "./routes/styles.module.css"',
        'import "external/styles.css"',
        'export { default } from "@/routes/styles.module.css"',
        'export * from "/src/theme/tokens/zIndex.css"',
        'void import("@/routes/styles.module.css?inline")',
        'void import(`@/routes/styles.module.css`)',
        'void import(source)'
      ].map(code => ({ filename: 'src/App.tsx', code })),
      invalid: [
        'import S from "@/routes/home.module.css?inline"',
        'export { default } from "@/routes/home.module.css"',
        'export * from "@/routes/home.module.css"',
        'void import("@/routes/home.module.css")',
        'void import(`@/routes/home.module.css`)'
      ].map(code => ({
        filename: 'src/App.tsx',
        code,
        errors: [
          {
            message:
              'Use styles.module.css outside src/theme/, including in routes.'
          }
        ]
      }))
    })
  })
})

describe('css module imports', () => {
  it('requires a single default import named S', () => {
    const rule = plugin.rules['css-modules-import']
    assert.ok(rule)
    new RuleTester({ cwd: ROOT }).run('css-modules-import', rule, {
      valid: [
        'import S from "./styles.module.css"',
        'import S from "./styles.module.css?inline"',
        'import "./global.css"',
        'import styles from "./global.css"'
      ].map(code => ({ filename: 'src/App.tsx', code })),
      invalid: [
        'import styles from "./styles.module.css"',
        'import "./styles.module.css"',
        'import S, { root } from "./styles.module.css"',
        'import * as S from "./styles.module.css"'
      ].map(code => ({
        filename: 'src/App.tsx',
        code,
        errors: [{ messageId: 'useS' }]
      }))
    })
  })
})
