import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildNameTable, exportedIcon } from '../index.ts'

function exportNames(icons: string[]): Set<string> {
  return new Set(buildNameTable({ icons, aliases: {} }).exports.keys())
}

describe('the export names', () => {
  it('write the name of an icon in PascalCase', () => {
    assert.deepEqual(
      exportNames(['github', 'arrow-left-01', 'logo.v2', 'my_icon']),
      new Set(['Github', 'ArrowLeft01', 'LogoV2', 'MyIcon'])
    )
  })

  it('prefix a name that starts with a digit', () => {
    assert.deepEqual(
      exportNames(['3d-move', '1st-bracket']),
      new Set(['Icon3dMove', 'Icon1stBracket'])
    )
  })

  it('leave out a name without letters or digits', () => {
    assert.deepEqual(exportNames(['_']), new Set())
  })

  it('keep an underscore before the digits after a separator when two icons collide', () => {
    assert.deepEqual(
      exportNames(['mp-3-02', 'mp-302']),
      new Set(['Mp_3_02', 'Mp_302'])
    )
    assert.deepEqual(
      exportNames(['mp-301', 'mp3-01']),
      new Set(['Mp_301', 'Mp3_01'])
    )
  })

  it('prefix a strict name that starts with a digit', () => {
    assert.deepEqual(
      exportNames(['3d-move-01', '3d-move01']),
      new Set(['Icon3dMove_01'])
    )
  })
})

describe('buildNameTable', () => {
  it('exports every icon by its PascalCase name', () => {
    const table = buildNameTable({
      icons: ['github', 'arrow-left-01', '3d-move'],
      aliases: {}
    })

    assert.deepEqual(Object.fromEntries(table.exports), {
      Github: 'github',
      ArrowLeft01: 'arrow-left-01',
      Icon3dMove: '3d-move'
    })
    assert.equal(table.ambiguous.size, 0)
  })

  it('gives each icon of a collision its strict name', () => {
    const table = buildNameTable({
      icons: ['arrow-down-01', 'arrow-down01', 'mp-3-02', 'mp-302'],
      aliases: {}
    })

    assert.equal(table.exports.get('ArrowDown01'), undefined)
    assert.equal(table.exports.get('ArrowDown_01'), 'arrow-down-01')
    assert.equal(table.exports.get('Mp_3_02'), 'mp-3-02')
    assert.equal(table.exports.get('Mp_302'), 'mp-302')
    assert.deepEqual(table.ambiguous.get('ArrowDown01'), [
      {
        name: 'arrow-down-01',
        icon: 'arrow-down-01',
        strictName: 'ArrowDown_01'
      },
      { name: 'arrow-down01', icon: 'arrow-down01', strictName: undefined }
    ])
  })

  it('exports an alias, and an alias of the same icon is no collision', () => {
    const table = buildNameTable({
      icons: ['1st-bracket', 'sorting-1-9'],
      aliases: { 'first-bracket': '1st-bracket', 'sorting-19': 'sorting-1-9' }
    })

    assert.equal(table.exports.get('FirstBracket'), '1st-bracket')
    assert.equal(table.exports.get('Icon1stBracket'), '1st-bracket')
    assert.equal(table.exports.get('Sorting19'), 'sorting-1-9')
    assert.equal(table.ambiguous.size, 0)
  })

  it('leaves out an alias whose icon is missing', () => {
    const table = buildNameTable({
      icons: ['star'],
      aliases: { moon: 'no-such-icon' }
    })

    assert.deepEqual([...table.exports.keys()], ['Star'])
  })

  it('leaves a strict name that two icons claim to the import by path', () => {
    const table = buildNameTable({ icons: ['a-1-b', 'a_1_b'], aliases: {} })

    assert.equal(table.exports.get('A1B'), undefined)
    assert.equal(table.exports.get('A_1B'), undefined)
    assert.deepEqual(
      table.ambiguous.get('A1B')?.map(icon => icon.strictName),
      [undefined, undefined]
    )
  })

  it('does not depend on the order of the icons', () => {
    const icons = ['rows-2', 'rows2', 'mp-301', 'mp3-01', 'github']
    const first = buildNameTable({ icons, aliases: {} })
    const second = buildNameTable({ icons: icons.toReversed(), aliases: {} })

    // assert compares the entries of a Map without their order.
    assert.deepEqual(first.exports, second.exports)
    assert.deepEqual(first.ambiguous, second.ambiguous)
  })

  it('reads the files of a folder collection by the same rule', () => {
    const table = buildNameTable({
      icons: ['logo.v2', 'star', 'dot-01', 'dot01'],
      aliases: {}
    })

    assert.equal(table.exports.get('LogoV2'), 'logo.v2')
    assert.equal(table.exports.get('Star'), 'star')
    assert.equal(table.exports.get('Dot_01'), 'dot-01')
    assert.equal(table.exports.get('Dot01'), undefined)
  })
})

describe('exportedIcon', () => {
  const table = buildNameTable({
    icons: ['github', 'arrow-left-01', 'arrow-down-01', 'arrow-down01'],
    aliases: {}
  })
  const lookup = (exportName: string) =>
    exportedIcon({ table, collection: 'hugeicons', exportName })

  it('finds the icon of a name', () => {
    assert.equal(lookup('Github'), 'github')
  })

  it('suggests the closest name of a missing one', () => {
    assert.throws(() => lookup('Githb'), {
      message: `"Githb" is not an icon of 'icon:hugeicons'. Did you mean Github?`
    })
    assert.throws(() => lookup('ArrowLeft_01'), {
      message: `"ArrowLeft_01" is not an icon of 'icon:hugeicons'. Did you mean ArrowLeft01?`
    })
  })

  it('suggests nothing for a name far from every icon', () => {
    assert.throws(() => lookup('Calendar'), {
      message: `"Calendar" is not an icon of 'icon:hugeicons'.`
    })
  })

  it('lists the strict names and the imports by path of an ambiguous name', () => {
    assert.throws(() => lookup('ArrowDown01'), {
      message: `"ArrowDown01" names more than one icon of 'icon:hugeicons': import ArrowDown_01 for arrow-down-01, or 'icon:hugeicons/arrow-down01' for arrow-down01.`
    })
  })
})
