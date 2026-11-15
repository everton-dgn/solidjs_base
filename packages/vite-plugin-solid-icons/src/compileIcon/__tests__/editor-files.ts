// The files as the applications write them, with what each one adds around
// the drawing.
export const INKSCAPE = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
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
export const ILLUSTRATOR_SAVE_AS = `<?xml version="1.0" encoding="utf-8"?>
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
export const ILLUSTRATOR_EXPORT_AS = `<?xml version="1.0" encoding="UTF-8"?>
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

export const FIGMA = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
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

export const SKETCH = `<?xml version="1.0" encoding="UTF-8"?>
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
export const SKETCH_OLD = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="24px" height="24px" viewBox="0 0 24 24" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:sketch="http://www.bohemiancoding.com/sketch/ns">
    <title>icon</title>
    <g id="Page-1" stroke="none" fill="none" fill-rule="evenodd" sketch:type="MSPage">
        <path d="M2,2 L22,2 L22,22 L2,22 Z" fill="#000000" sketch:type="MSShapeGroup"></path>
    </g>
</svg>
`
