import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, type TestContext } from 'node:test'

import { loadIconSvg } from '../../loadIconSvg/index.ts'
import { readFolderFiles } from '../../readFolderFiles/index.ts'
import { compileIcon } from '../index.ts'

type ExportInput = { context: TestContext; name: string; file: string }

// The files as the applications write them, with what each one adds around
// the drawing.
const INKSCAPE = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- Created with Inkscape (http://www.inkscape.org/) -->

<svg
   width="24"
   height="24"
   viewBox="0 0 24 24"
   version="1.1"
   id="svg5"
   inkscape:version="1.3 (0e150ed, 2023-07-21)"
   sodipodi:docname="icon.svg"
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
   xmlns="http://www.w3.org/2000/svg"
   xmlns:svg="http://www.w3.org/2000/svg"
   xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
   xmlns:cc="http://creativecommons.org/ns#"
   xmlns:dc="http://purl.org/dc/elements/1.1/">
  <sodipodi:namedview
     id="namedview7"
     pagecolor="#ffffff"
     inkscape:pageopacity="0.0"
     inkscape:document-units="px"
     inkscape:current-layer="layer1" />
  <defs
     id="defs2" />
  <metadata
     id="metadata5">
    <rdf:RDF>
      <cc:Work
         rdf:about="">
        <dc:format>image/svg+xml</dc:format>
        <dc:type
           rdf:resource="http://purl.org/dc/dcmitype/StillImage" />
      </cc:Work>
    </rdf:RDF>
  </metadata>
  <g
     inkscape:label="Layer 1"
     inkscape:groupmode="layer"
     id="layer1">
    <path
       style="fill:#000000;stroke-width:0.26"
       d="M 2,2 H 22 V 22 H 2 Z"
       id="rect234"
       sodipodi:nodetypes="ccccc" />
  </g>
</svg>
`

// Save As of Illustrator: the namespaces are entities of its DOCTYPE.
const ILLUSTRATOR_SAVE_AS = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generator: Adobe Illustrator 27.0.0, SVG Export Plug-In . SVG Version: 6.00 Build 0)  -->
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [
	<!ENTITY ns_extend "http://ns.adobe.com/Extensibility/1.0/">
	<!ENTITY ns_ai "http://ns.adobe.com/AdobeIllustrator/10.0/">
	<!ENTITY ns_graphs "http://ns.adobe.com/Graphs/1.0/">
	<!ENTITY ns_svg "http://www.w3.org/2000/svg">
	<!ENTITY ns_xlink "http://www.w3.org/1999/xlink">
]>
<svg version="1.1" id="Layer_1" xmlns:x="&ns_extend;" xmlns:i="&ns_ai;" xmlns:graph="&ns_graphs;"
	 xmlns="&ns_svg;" xmlns:xlink="&ns_xlink;" x="0px" y="0px" viewBox="0 0 24 24"
	 style="enable-background:new 0 0 24 24;" xml:space="preserve">
<switch>
	<g i:extraneous="self">
		<path d="M2,2h20v20H2V2z"/>
	</g>
</switch>
</svg>
`

// Export As of Illustrator, with its classes in a <style>.
const ILLUSTRATOR_EXPORT_AS = `<?xml version="1.0" encoding="UTF-8"?>
<svg id="Layer_1" data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <defs>
    <style>
      .cls-1 {
        fill: #231f20;
      }
    </style>
  </defs>
  <path class="cls-1" d="M2,2h20v20H2V2z"/>
</svg>
`

const FIGMA = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<g clip-path="url(#clip0_1_2)" filter="url(#filter0_d_1_2)">
<rect width="24" height="24" fill="url(#pattern0_1_2)"/>
<mask id="mask0_1_2" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
<rect width="24" height="24" fill="#D9D9D9"/>
</mask>
<g mask="url(#mask0_1_2)">
<path d="M2 2H22V22H2V2Z" fill="#1C1B1F"/>
</g>
</g>
<defs>
<filter id="filter0_d_1_2" x="-4" y="0" width="32" height="32" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dy="4"/>
<feGaussianBlur stdDeviation="2"/>
<feComposite in2="hardAlpha" operator="out"/>
<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
</filter>
<pattern id="pattern0_1_2" patternContentUnits="objectBoundingBox" width="1" height="1">
<use xlink:href="#image0_1_2" transform="scale(0.01)"/>
</pattern>
<clipPath id="clip0_1_2">
<rect width="24" height="24" fill="white"/>
</clipPath>
<image id="image0_1_2" width="100" height="100" xlink:href="data:image/png;base64,iVBORw0KGgo="/>
</defs>
</svg>
`

const SKETCH = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="24px" height="24px" viewBox="0 0 24 24" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <!-- Generator: Sketch 64 (93537) - https://sketch.com -->
    <title>icon</title>
    <desc>Created with Sketch.</desc>
    <defs>
        <path d="M2,2 L22,2 L22,22 L2,22 Z" id="path-1"></path>
    </defs>
    <g id="Page-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
        <g id="icon">
            <mask id="mask-2" fill="white">
                <use xlink:href="#path-1"></use>
            </mask>
            <use id="Combined-Shape" fill="#000000" xlink:href="#path-1"></use>
        </g>
    </g>
</svg>
`

// The older Sketch wrote its own namespace on the elements.
const SKETCH_OLD = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="24px" height="24px" viewBox="0 0 24 24" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:sketch="http://www.bohemiancoding.com/sketch/ns">
    <title>icon</title>
    <g id="Page-1" stroke="none" fill="none" fill-rule="evenodd" sketch:type="MSPage">
        <path d="M2,2 L22,2 L22,22 L2,22 Z" fill="#000000" sketch:type="MSShapeGroup"></path>
    </g>
</svg>
`

const EDITOR_TEXT = /sodipodi|inkscape|metadata|rdf:|cc:|dc:|sketch:/u

async function compileExport({ context, name, file }: ExportInput) {
  const prefix = path.join(tmpdir(), 'solid-icons-editors-')
  const folder = await realpath(await mkdtemp(prefix))
  context.after(() => rm(folder, { recursive: true, force: true }))
  await writeFile(path.join(folder, `${name}.svg`), file)
  const root = path.dirname(folder)
  const files = await readFolderFiles({ collection: 'own', folder, root })
  const { svg } = await loadIconSvg({
    collection: 'own',
    name,
    root,
    folder: { path: folder, files },
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
    assert.match(raw.code, /<g\\n {5}id=\\"layer1\\">/u)
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
