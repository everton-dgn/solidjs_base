import assert from 'node:assert/strict'
import { it } from 'node:test'

import { projectSummary } from '../src/project-summary.ts'
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
    assert.ok(lines.every(line => line.length + 6 <= 80))
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
