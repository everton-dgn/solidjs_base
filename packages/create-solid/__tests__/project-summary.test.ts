import assert from 'node:assert/strict'
import { it } from 'node:test'

import { projectSummary } from '../src/projectSummary/index.ts'
import { validateProfile } from '../src/validateProfile/index.ts'

void it('lists selected features in order and fits the default note in 80 columns', () => {
  for (const [language, expected] of [
    ['en', 'Features: SEO, Theme, Icons, Inter font, Solid diagnostics'],
    ['pt-BR', 'Recursos: SEO, Tema, Ícones, Fonte Inter, Diagnóstico do Solid'],
    [
      'es',
      'Funcionalidades: SEO, Tema, Iconos, Fuente Inter, Diagnóstico de Solid'
    ]
  ] as const) {
    const validated = validateProfile({ name: 'solid-app' })
    const lines = projectSummary({ validated, language }).split('\n')
    assert.ok(lines.includes(expected))
    const borderWidth = 6
    const terminalWidth = 80
    assert.ok(lines.every(line => line.length + borderWidth <= terminalWidth))
    const subset = validateProfile({
      name: 'solid-app',
      'no-seo': true,
      'no-fonts': true
    })
    const summary = projectSummary({ validated: subset, language })
    assert.ok(!summary.includes('SEO'))
    assert.ok(!summary.includes('Inter'))
  }
})

void it('identifies the base language and an existing Git repository', () => {
  const validated = validateProfile({ name: '../..' })
  for (const [language, git] of [
    ['en', 'already present'],
    ['pt-BR', 'já existe'],
    ['es', 'ya existe']
  ] as const) {
    const summary = projectSummary({ validated, language })
    assert.ok(summary.includes('en (base)'))
    assert.ok(summary.includes(`Git: ${git}`))
  }
})
