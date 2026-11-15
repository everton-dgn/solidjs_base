import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { compileIcon } from '../../compileIcon/index.ts'

type Refusal = { svg: string; message: RegExp }

function component(svg: string): string {
  return compileIcon({ svg, isRaw: false, icon: 'own/test' }).code
}

function raw(svg: string): string {
  return compileIcon({ svg, isRaw: true, icon: 'own/test' }).code
}

const CODE: Refusal[] = [
  {
    svg: '<svg><script>alert(1)</script></svg>',
    message: /the SVG has a <script> element, which runs code/u
  },
  {
    svg: '<svg><svg:SCRIPT>alert(1)</svg:SCRIPT></svg>',
    message: /the SVG has a <svg:SCRIPT> element, which runs code/u
  },
  {
    svg: '<svg onload="alert(1)"><path d="M0"/></svg>',
    message: /the attribute onload of <svg> is an event handler/u
  },
  {
    svg: '<svg><path ONCLICK="alert(1)"/></svg>',
    message: /the attribute ONCLICK of <path> is an event handler/u
  },
  {
    svg: '<svg><a href="javascript:alert(1)"><path/></a></svg>',
    message: /the attribute href of <a> is a script URL/u
  },
  {
    svg: '<svg><a xlink:href=" JaVaScRiPt:alert(1)"><path/></a></svg>',
    message: /the attribute xlink:href of <a> is a script URL/u
  },
  {
    svg: '<svg><a href="&#106;ava&#x09;script&#58;alert(1)"><path/></a></svg>',
    message: /the attribute href of <a> is a script URL/u
  },
  {
    svg: '<svg><a href="vbscript:msgbox(1)"><path/></a></svg>',
    message: /the attribute href of <a> is a script URL/u
  },
  {
    svg: '<svg><a><set attributeName="href" to="javascript:alert(1)"/></a></svg>',
    message: /the attribute attributeName of <set> animates a link/u
  },
  {
    svg: '<svg><a><animate attributeName=" xlink:href " values="#a;#b"/></a></svg>',
    message: /the attribute attributeName of <animate> animates a link/u
  },
  {
    svg: '<svg><a><set attributeName="fill" to="javascript:alert(1)"/></a></svg>',
    message: /the attribute to of <set> is a script URL/u
  },
  {
    svg: '<svg><animate attributeName="fill" from="javascript:alert(1)"/></svg>',
    message: /the attribute from of <animate> is a script URL/u
  },
  {
    svg: '<svg><animate attributeName="fill" by="javascript:alert(1)"/></svg>',
    message: /the attribute by of <animate> is a script URL/u
  },
  {
    svg: '<svg><animate attributeName="fill" values="#safe; javascript:alert(1)"/></svg>',
    message: /the attribute values of <animate> is a script URL/u
  },
  {
    svg: '<svg><foreignObject><img src="x"/></foreignObject></svg>',
    message: /the SVG has a <foreignObject> element, which embeds HTML/u
  }
]

// Elements that are not SVG: the HTML parser of a page reads some of them as
// HTML even inside an <svg>, and JSX reads the others as code.
const NOT_SVG: Refusal[] = [
  {
    svg: '<svg><p><iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe></p></svg>',
    message:
      /the SVG has a <p> element, which is not an SVG element: a browser can read it as HTML/u
  },
  {
    svg: '<svg><g><iframe srcdoc="x"/></g></svg>',
    message: /the SVG has a <iframe> element, which is not an SVG element/u
  },
  {
    svg: '<svg><embed src="data:text/html,x"/></svg>',
    message: /the SVG has a <embed> element, which is not an SVG element/u
  },
  {
    svg: '<svg><meta http-equiv="refresh" content="0;url=data:text/html,x"/></svg>',
    message: /the SVG has a <meta> element, which is not an SVG element/u
  },
  {
    svg: '<svg><object data="x.html"/></svg>',
    message: /the SVG has a <object> element, which is not an SVG element/u
  },
  {
    svg: '<svg><font color="red">x</font></svg>',
    message: /the SVG has a <font> element, which is not an SVG element/u
  },
  {
    svg: '<svg><img src="x"/></svg>',
    message: /the SVG has a <img> element, which is not an SVG element/u
  },
  {
    svg: '<svg><window.alert/></svg>',
    message:
      /the SVG has a <window\.alert> element, which is not an SVG element/u
  },
  {
    svg: '<svg><Text/></svg>',
    message: /the SVG has a <Text> element, which is not an SVG element/u
  },
  {
    svg: '<svg><svg:path/></svg>',
    message: /the SVG has a <svg:path> element, which is not an SVG element/u
  },
  {
    svg: '<svg><title><a href="#x">x</a></title></svg>',
    message: /the SVG has a <a> element inside <title>, which holds text only/u
  },
  {
    svg: '<svg><desc><style>a{}</style></desc></svg>',
    message:
      /the SVG has a <style> element inside <desc>, which holds text only/u
  },
  {
    svg: '<svg><style><![CDATA[</style><img src=x onerror=alert(1)><style>]]></style></svg>',
    message:
      /the text of <style> has a "<", which can end the element in the HTML of a page/u
  },
  {
    svg: '<svg><style>&lt;/style&gt;&lt;img src=x onerror=alert(1)&gt;</style></svg>',
    message: /the text of <style> has a "<"/u
  },
  {
    svg: '<svg><title><![CDATA[x><img src=x onerror=alert(1)>]]></title></svg>',
    message: /the text of <title> has a "<"/u
  },
  {
    svg: '<svg><desc>&#60;img src=x onerror=alert(1)></desc></svg>',
    message: /the text of <desc> has a "<"/u
  }
]

const JSX_CODE: Refusal[] = [
  {
    svg: '<svg><g prop:innerHTML="x"/></svg>',
    message: /the attribute prop:innerHTML of <g> is not an attribute in JSX/u
  },
  {
    svg: '<svg><g innerHTML="x"/></svg>',
    message: /the attribute innerHTML of <g> is not an attribute in JSX/u
  },
  {
    svg: '<svg><g children="x"/></svg>',
    message: /the attribute children of <g> is not an attribute in JSX/u
  },
  {
    svg: '<svg><g ref="alert"/></svg>',
    message: /the attribute ref of <g> is not an attribute in JSX/u
  },
  {
    svg: '<svg><g use:alert="1"/></svg>',
    message: /the attribute use:alert of <g> is not an attribute in JSX/u
  },
  {
    svg: '<svg><g data.x="1"/></svg>',
    message: /the attribute data\.x of <g> is not an attribute in JSX/u
  }
]

const MALFORMED: Refusal[] = [
  { svg: '<g/>', message: /the file has no <svg> root element/u },
  { svg: '<svgx/>', message: /the file has no <svg> root element/u },
  { svg: '<svg><g><path/></svg>', message: /<\/svg> closes <g>/u },
  { svg: '<svg><path/>', message: /<svg> is not closed/u },
  { svg: '<svg><path', message: /<path> is not closed/u },
  {
    svg: '<svg><path ="1"/></svg>',
    message: /<path> has an attribute without a name/u
  },
  {
    svg: '<svg><path d="M0/></svg>',
    message: /the value of the attribute d of <path> is not closed/u
  },
  {
    svg: '<svg><g></g</svg>',
    message: /the closing tag of <g> is not closed/u
  },
  { svg: '<svg>< </svg>', message: /a "<" starts no tag: write &lt;/u },
  { svg: '<svg><path d=M0/></svg>', message: /has no quoted value/u },
  { svg: '<svg><path d="a<b"/></svg>', message: /has a "<"/u },
  {
    svg: '<svg><path d="1"d="2"/></svg>',
    message: /are not separated by spaces/u
  },
  {
    svg: '<svg><path d="1" d="2"/></svg>',
    message: /appears twice on <path>/u
  },
  { svg: '<svg></svg>trailing', message: /content follows the root element/u },
  { svg: '<svg><!-- open</svg>', message: /a <!-- is not closed/u },
  {
    svg: '<svg><text>a & b</text></svg>',
    message: /a "&" starts no reference/u
  },
  {
    svg: '<svg><text>&nbsp;</text></svg>',
    message: /&nbsp; is not an XML entity/u
  },
  // An entity of a DOCTYPE, as in an external entity or a chain of
  // entities: the plugin reads no DOCTYPE, so no entity expands.
  {
    svg: '<svg><text>&xxe;</text></svg>',
    message: /&xxe; is not an XML entity/u
  },
  { svg: '<svg><text>&#0;</text></svg>', message: /&#0; is not a character/u },
  {
    svg: '<svg><!ENTITY a "b"><text/></svg>',
    message: /a <! declaration sits inside the root element/u
  },
  {
    svg: '<svg>a ]]> b</svg>',
    message: /a "\]\]>" sits outside a CDATA section/u
  }
]

describe('the markup of an icon', () => {
  it('refuses the markup that runs code, also as raw text', () => {
    for (const { svg, message } of CODE) {
      assert.throws(() => component(svg), message, svg)
      assert.throws(() => raw(svg), message, svg)
    }
  })

  it('refuses what is not SVG, also as raw text', () => {
    for (const { svg, message } of NOT_SVG) {
      assert.throws(() => component(svg), message, svg)
      assert.throws(() => raw(svg), message, svg)
    }
  })

  it('accepts the SVG elements, with CSS that has a ">"', () => {
    const svg =
      '<svg><defs><linearGradient id="g"><stop offset="0"/></linearGradient><filter id="f"><feGaussianBlur stdDeviation="1"/></filter></defs><style>.a > .b { fill: url(#g) }</style><title>a &gt; b</title><g filter="url(#f)"><path class="a" d="M0 0"/><animate attributeName="opacity" values="0;1"/></g></svg>'

    assert.doesNotThrow(() => component(svg))
    assert.equal(raw(svg), `export default ${JSON.stringify(svg)}\n`)
  })

  it('refuses the markup that JSX reads as code', () => {
    for (const { svg, message } of JSX_CODE) {
      assert.throws(() => component(svg), message, svg)
      assert.throws(() => component(svg), /import the icon with \?raw/u, svg)
      assert.doesNotThrow(() => raw(svg), svg)
    }
  })

  it('names the icon and the problem of a malformed SVG', () => {
    for (const { svg, message } of MALFORMED) {
      assert.throws(() => component(svg), message, svg)
      assert.throws(() => component(svg), /^Error: Icon "own\/test": /u, svg)
    }
  })

  it('writes text and values with markup characters as strings', () => {
    const code = component(
      `<svg><text x="a{b}">{globalThis.pwned = 1} a > b &amp; &lt;i&gt; &apos;</text><style><![CDATA[.a > .b { fill: red }]]></style><path d="&#77;0" title='say "hi"'/></svg>`
    )

    assert.equal(
      code,
      `export default (props = {}) => <svg {...props}><text x="a{b}">{"{globalThis.pwned = 1} a > b & <i> '"}</text><style>{".a > .b { fill: red }"}</style><path d={"M0"} title={"say \\"hi\\""}/></svg>\n`
    )
  })

  it('leaves out comments and instructions, and keeps them as raw text', () => {
    const svg = '<svg><!-- a <b> --><?pi x?><path d="M0"/></svg><!-- end -->'

    assert.equal(
      component(svg),
      'export default (props = {}) => <svg {...props}><path d="M0"/></svg>\n'
    )
    assert.equal(raw(svg), `export default ${JSON.stringify(svg)}\n`)
  })

  it('keeps the first of a repeated attribute of the root', () => {
    const svg =
      '<svg aria-hidden="true" viewBox="0 0 1 1" aria-hidden="false"><path/></svg>'

    assert.equal(
      component(svg),
      'export default (props = {}) => <svg aria-hidden="true" viewBox="0 0 1 1" {...props}><path/></svg>\n'
    )
    assert.equal(
      raw(svg),
      `export default ${JSON.stringify('<svg aria-hidden="true" viewBox="0 0 1 1"><path/></svg>')}\n`
    )
  })

  it('reads a deep markup without running out of stack', () => {
    const depth = 50_000
    const svg = `<svg>${'<g>'.repeat(depth)}${'</g>'.repeat(depth)}</svg>`

    assert.match(
      component(svg),
      /^export default \(props = \{\}\) => <svg \{\.\.\.props\}><g>/u
    )
  })

  it('writes an element with more children than a call takes arguments', () => {
    const children = 200_000
    const svg = `<svg>${'<path/>'.repeat(children)}</svg>`

    assert.ok(component(svg).endsWith('<path/></svg>\n'))
  })
})
