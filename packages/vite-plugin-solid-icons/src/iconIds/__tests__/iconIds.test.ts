import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  collectionOfImport,
  iconId,
  iconImport,
  isCollectionName,
  parseIconRequest,
  readIconId
} from '../index.ts'

describe('parseIconRequest', () => {
  it('reads the collection and the name of a component import', () => {
    assert.deepEqual(parseIconRequest('icon:hugeicons/github'), {
      collection: 'hugeicons',
      name: 'github',
      isRaw: false
    })
  })

  it('reads ?raw as the SVG text', () => {
    assert.deepEqual(parseIconRequest('icon:hugeicons/github?raw'), {
      collection: 'hugeicons',
      name: 'github',
      isRaw: true
    })
  })

  it('keeps the dots of a name', () => {
    assert.equal(parseIconRequest('icon:own/logo.v2')?.name, 'logo.v2')
  })

  it('ignores the imports of other modules', () => {
    assert.equal(parseIconRequest('./icon.svg'), undefined)
    assert.equal(parseIconRequest('solid-js'), undefined)
  })

  it('resolves a resolved id to itself', () => {
    const request = { collection: 'own', name: 'logo.v2', isRaw: false }

    assert.deepEqual(parseIconRequest(iconId(request)), request)
    assert.deepEqual(parseIconRequest(iconId({ ...request, isRaw: true })), {
      ...request,
      isRaw: true
    })
  })

  it('leaves the import of a collection to the named imports', () => {
    assert.throws(
      () => parseIconRequest('icon:hugeicons'),
      /Invalid icon import "icon:hugeicons"/u
    )
  })

  it('refuses a name that leaves the folder of the collection', () => {
    for (const specifier of [
      'icon:own/../secret',
      'icon:own/.hidden',
      'icon:own/a/b',
      'icon:Own/star',
      'icon:own/'
    ]) {
      assert.throws(() => parseIconRequest(specifier), {
        message: `Invalid icon import "${specifier}". Import an icon as 'icon:<collection>/<name>', or 'icon:<collection>/<name>?raw' for the SVG text.`
      })
    }
  })

  it('refuses a query other than ?raw', () => {
    for (const specifier of [
      'icon:hugeicons/github?url',
      'icon:hugeicons/github?raw=false',
      'icon:hugeicons/github?raw&width=2'
    ]) {
      assert.throws(
        () => parseIconRequest(specifier),
        /only \?raw is accepted/u
      )
    }
  })
})

describe('iconId', () => {
  it('ends the component id in .tsx without a null byte', () => {
    const id = iconId({ collection: 'own', name: 'logo.v2', isRaw: false })

    assert.equal(id, 'icon:own/logo.v2.tsx')
  })

  it('keeps the raw id away from the Solid plugin and the ?raw of Vite', () => {
    const id = iconId({ collection: 'own', name: 'star', isRaw: true })

    assert.equal(id, '\0icon:own/star.js')
    assert.deepEqual(readIconId(id), {
      collection: 'own',
      name: 'star',
      isRaw: true
    })
  })

  it('reads only its own ids', () => {
    assert.equal(readIconId('/src/App.tsx'), undefined)
    assert.equal(readIconId('icon:hugeicons/github'), undefined)
  })
})

describe('isCollectionName', () => {
  it('accepts the names of the Iconify collections', () => {
    assert.equal(isCollectionName('hugeicons'), true)
    assert.equal(isCollectionName('material-symbols'), true)
  })

  it('refuses names that the import cannot spell', () => {
    for (const name of ['Own', 'my_icons', 'a--b', '-own', 'own/x', '']) {
      assert.equal(isCollectionName(name), false, name)
    }
  })
})

describe('collectionOfImport', () => {
  it('reads the collection of an import by export name', () => {
    assert.equal(collectionOfImport('icon:hugeicons'), 'hugeicons')
    assert.equal(
      collectionOfImport('icon:material-symbols'),
      'material-symbols'
    )
  })

  it('ignores the imports of one icon and of other modules', () => {
    for (const specifier of [
      'icon:hugeicons/github',
      'icon:hugeicons?raw',
      'icon:Own',
      'icon:',
      'hugeicons'
    ]) {
      assert.equal(collectionOfImport(specifier), undefined, specifier)
    }
  })
})

describe('iconImport', () => {
  it('writes the import of one icon', () => {
    assert.equal(
      iconImport({ collection: 'hugeicons', name: 'arrow-left-01' }),
      'icon:hugeicons/arrow-left-01'
    )
  })
})
