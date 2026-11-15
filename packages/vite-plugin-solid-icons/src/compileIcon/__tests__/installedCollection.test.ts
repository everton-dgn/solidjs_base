import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'node:test'

import { loadIconSet } from '../../loadIconSet/index.ts'
import { loadIconSvg } from '../../loadIconSvg/index.ts'
import type { IconCustomizer } from '../../types.ts'
import { compileIcon } from '../index.ts'

// The package installs @iconify-json/hugeicons for its tests.
const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../../..')
// hugeicons has more than six thousand names; fewer means the set did not load.
const MIN_NAMES = 6000

const hideIcon: IconCustomizer = ({ attributes }) => {
  attributes['aria-hidden'] = 'true'
}

describe('the strict markup', () => {
  it('compiles every icon and alias of an installed collection', async () => {
    const iconSet = await loadIconSet({
      collection: 'hugeicons',
      root: PACKAGE_ROOT
    })
    const names = [
      ...Object.keys(iconSet.icons),
      ...Object.keys(iconSet.aliases ?? {})
    ]
    const refused: string[] = []
    for (const name of names) {
      const { svg } = await loadIconSvg({
        collection: 'hugeicons',
        name,
        root: PACKAGE_ROOT,
        folder: undefined,
        customizeIcon: hideIcon
      })
      for (const isRaw of [false, true]) {
        try {
          compileIcon({ svg, isRaw, icon: `hugeicons/${name}` })
        } catch (error) {
          refused.push(String(error))
        }
      }
    }

    assert.ok(names.length > MIN_NAMES)
    assert.deepEqual(refused, [])
  })
})
