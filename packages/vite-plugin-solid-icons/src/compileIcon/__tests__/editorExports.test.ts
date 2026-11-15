import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, type TestContext } from 'node:test'

import { createNameTables } from '../../iconCollections/index.ts'
import { loadIconSvg } from '../../loadIconSvg/index.ts'
import { compileIcon } from '../index.ts'
import {
  FIGMA,
  ILLUSTRATOR_EXPORT_AS,
  ILLUSTRATOR_SAVE_AS,
  INKSCAPE,
  SKETCH,
  SKETCH_OLD
} from './editor-files.ts'

type ExportInput = { context: TestContext; name: string; file: string }

const EDITOR_TEXT = /sodipodi|inkscape|metadata|rdf:|cc:|dc:|sketch:/u

async function compileExport({ context, name, file }: ExportInput) {
  const prefix = path.join(tmpdir(), 'solid-icons-editors-')
  const folder = await realpath(await mkdtemp(prefix))
  context.after(() => rm(folder, { recursive: true, force: true }))
  await writeFile(path.join(folder, `${name}.svg`), file)
  const root = path.dirname(folder)
  const tables = createNameTables({ root, folders: new Map([['own', folder]]) })
  const { svg } = await loadIconSvg({
    collection: 'own',
    name,
    root,
    folder: {
      path: folder,
      files: await tables.files('own'),
      refresh: () => tables.refresh('own')
    },
    customizeIcon: undefined
  })
  const icon = `own/${name}`
  return {
    component: compileIcon({ svg, isRaw: false, icon }),
    raw: compileIcon({ svg, isRaw: true, icon })
  }
}

describe('the SVG files of drawing applications', () => {
  it('compiles an Inkscape file without its editor data', async context => {
    const { component, raw } = await compileExport({
      context,
      name: 'inkscape',
      file: INKSCAPE
    })

    for (const { code } of [component, raw]) {
      assert.doesNotMatch(code, EDITOR_TEXT)
      assert.match(code, /M 2,2 H 22 V 22 H 2 Z/u)
      assert.match(code, /xmlns:svg=/u)
    }
    assert.deepEqual(component.dropped, [
      'inkscape:version',
      'sodipodi:docname',
      'xmlns:inkscape',
      'xmlns:sodipodi',
      'xmlns:rdf',
      'xmlns:cc',
      'xmlns:dc',
      '<sodipodi:namedview>',
      '<metadata>',
      'inkscape:label',
      'inkscape:groupmode',
      'sodipodi:nodetypes'
    ])
    assert.deepEqual(raw.dropped, component.dropped)
    // The raw text is written again, one space between the attributes.
    assert.match(raw.code, /<g id=\\"layer1\\">/u)
  })

  it('compiles the files of Figma and Sketch as they are', async context => {
    for (const [name, file] of [
      ['figma', FIGMA],
      ['sketch', SKETCH]
    ] as const) {
      const { component, raw } = await compileExport({ context, name, file })

      assert.deepEqual(component.dropped, [], name)
      assert.match(component.code, /<svg /u, name)
      assert.doesNotMatch(raw.code, /<\?xml/u, name)
    }
  })

  it('drops the namespace of the older Sketch', async context => {
    const { component, raw } = await compileExport({
      context,
      name: 'sketch-old',
      file: SKETCH_OLD
    })

    assert.deepEqual(component.dropped, ['xmlns:sketch', 'sketch:type'])
    assert.doesNotMatch(component.code, EDITOR_TEXT)
    assert.doesNotMatch(raw.code, EDITOR_TEXT)
  })

  it('compiles an Export As of Illustrator, with its <style>', async context => {
    const { component } = await compileExport({
      context,
      name: 'illustrator',
      file: ILLUSTRATOR_EXPORT_AS
    })

    assert.match(component.code, /\.cls-1 \{/u)
    assert.match(component.code, /data-name="Layer 1"/u)
  })

  it('refuses a Save As of Illustrator, whose names are entities', async context => {
    await assert.rejects(
      compileExport({
        context,
        name: 'illustrator',
        file: ILLUSTRATOR_SAVE_AS
      }),
      /Icon "own\/illustrator": the SVG is not well-formed: &ns_extend; is not an XML entity/u
    )
  })
})
