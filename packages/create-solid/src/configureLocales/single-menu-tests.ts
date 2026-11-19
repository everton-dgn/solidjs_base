import { readFileSync } from 'node:fs'
import path from 'node:path'

import { editTemplate } from '../edit-template.ts'
import type { StagedContext } from '../types.ts'

type Edit = readonly [RegExp, string]
const hydrated =
  "await expect(page.locator('html')).toHaveAttribute('data-hydration-ended', '')"
const menu: Edit = [
  /await page\.getByRole\('button', \{ name: (?:'[^']+'|LANGUAGE_BUTTON) \}\)\.click\(\)\n\s*await expect\(page\.getByRole\('menu'\)\)\.toBeVisible\(\)(?:\n\s*await page\.keyboard\.press\('Escape'\))?(?:\n\s*await expect\(page\.getByRole\('menu'\)\)\.not\.toBeVisible\(\))?/u,
  hydrated
]
const noMenu: Edit = [
  /await page\.getByRole\('button', \{ name: LANGUAGE_BUTTON \}\)\.click\(\)\n\s*await expect\(page\.getByRole\('menu'\)\)\.toHaveCount\(0\)/u,
  "await expect(page.locator('html')).not.toHaveAttribute('data-hydration-ended')"
]

export function configureSingleMenuTests({
  stage,
  profile,
  write
}: StagedContext): void {
  const files: Record<string, Edit[]> = {
    'I18n/I18n.urlPattern.production': [
      [
        / {2}await page\.getByRole\('button', \{ name: '[^']+' \}\)\.click\(\)\n {2}await page\n {4}\.getByRole\('menuitemradio',[\s\S]*? {2}await expect\(page\)\.toHaveURL\('[^']+'\)\n/u,
        ''
      ]
    ],
    'Hydration/Hydration': [
      [/^test\('replays a click captured before hydration[\s\S]*?^\}\)\n/mu, '']
    ],
    'I18n/I18n.hydration': [
      [
        /^test\('does not reload an unchanged URL when its SSR language differs[\s\S]*?^\}\)\n/mu,
        ''
      ]
    ]
  }
  if (profile.hasSeo !== false) {
    files['AgentReadiness/AgentReadiness.content.production'] = [
      [
        /await expect\(\s*page\.getByRole\('button', \{ name: language\.selector \}\)\s*\)\.toBeInViewport\(\)/u,
        "await expect(page.getByRole('button', { name: language.selector })).toHaveCount(0)"
      ]
    ]
  }
  if (profile.hasTheme === false) {
    for (const suite of [
      'Hydration/Hydration.parser',
      'Hydration/Hydration.preload',
      'Hydration/Hydration.streaming',
      'Home/Home.csp.production'
    ]) {
      files[suite] = [menu]
    }
    if (profile.hasSeo !== false) files['NotFound/NotFound.seo'] = [menu]
    files['Home/Home.layout'] = [
      [
        /await page\.getByRole\('button', \{ name: '[^']+' \}\)\.waitFor\(\)/u,
        hydrated
      ],
      menu
    ]
    files['I18n/I18n.hydration']?.push(menu)
    files['Hydration/Hydration']?.push(
      [/^const LANGUAGE_BUTTON = [^\n]+\n/mu, ''],
      menu,
      [
        /const trigger = page\.getByRole\('button', \{\s*name: LANGUAGE_BUTTON\s*\}\)\n\s*await trigger\.click\(\)/u,
        "await expect(page.getByRole('banner').getByRole('button')).toHaveCount(0)"
      ],
      noMenu
    )
  }
  for (const [name, edits] of Object.entries(files)) {
    const file = `src/tests/pages/${name}.e2e.test.ts`
    let text = readFileSync(path.join(stage, file), 'utf8')
    for (const [pattern, replacement] of edits) {
      text = editTemplate({ file, text, pattern, replacement })
    }
    write({ file, content: text })
  }
}
