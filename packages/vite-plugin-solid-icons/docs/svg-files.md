# What the plugin does with your SVG files

[Icons plugin reference](README.md)

The SVG files of a folder collection are part of your application, as its source
files are: the plugin does not sanitize them, and you review them as you review
code. What the plugin guarantees is that the markup of a file stays markup:

- The component and `?raw` write again the elements, attributes and text that
  the file parses to. No text of the file becomes JavaScript, a JSX expression,
  a component or a DOM property, and Solid escapes the text and the values when
  it renders them. No part of the file that the plugin skips, such as a comment,
  reaches the page, where the HTML parser could end it in another place.
- The text of `<text>` and of the elements inside it, and of `<title>`, `<desc>`
  and `<style>`, keeps its line breaks and spaces in the component, on the
  client and on the server, so it draws as in the file and in `?raw`, also with
  `xml:space="preserve"`. The spaces between the other elements draw nothing and
  stay out of the component.
- The build stops, with the icon and the reason, on markup that runs code in a
  page: a `<script>` element, an event handler attribute such as `onload`, a
  `javascript:` or `vbscript:` URL in any attribute or in an entry of the
  `values` of an animation, and an animation of `href`.
- The build stops on a `data:` URL that a page opens as a document of its own:
  in the `href` or `xlink:href` of an `<a>` or of a `<use>`, and in an `<image>`
  or a `<feImage>` unless it holds an image, a PNG, JPEG, GIF, WebP, AVIF or
  SVG.
- The build stops on markup that a page reads as HTML, where it can run code:
  - an element outside the elements of SVG 2, its filters and its animations,
    such as `<p>`, `<iframe>`, `<img>`, `<embed>` or `<meta>`, at any depth;
  - `<foreignObject>`, which embeds HTML;
  - an element inside `<title>`, `<desc>` or `<style>`, which hold text only: a
    browser reads the content of `<title>` and `<desc>` as HTML;
  - a `<` in the text of `<style>`, written in a CDATA section or as `&lt;`: the
    server writes the text of `<style>` as it is, and a `<` there could end the
    element. A `<` in the text of `<title>` and `<desc>` stays text: the
    component, the server and `?raw` write it escaped.

  These checks apply to the component and to `?raw`, for a folder and for an
  installed collection.

- The build also stops on a `&` before a letter or a `#` in the text of
  `<style>`, written as `&amp;` or in a CDATA section, as in `&amp;quot;`: the
  server writes that text as it is, and a page reads a character reference
  there, so the CSS of the server and of the hydrated page would differ from the
  one of the client and of `?raw`. In a CSS string or URL, the escape `\26 `
  writes a `&`, and a nesting selector such as `&#id` can be written `#id&`. A
  `&` before a space, a digit or punctuation, as in `&:hover`, `& .x` or `&.on`,
  stays as it is. The check applies to the component, to the server and to
  `?raw`.
- The component also refuses the markup that JSX reads as code: the attributes
  `innerHTML`, `textContent`, `innerText`, `children` and `ref`, and the
  namespaces that Solid reads, such as `prop:` and `use:`. `?raw` keeps them as
  text.
- The data that drawing applications write for themselves draws nothing and is
  left out of the component and of `?raw`: `<metadata>`, and the elements and
  attributes of the `sodipodi`, `inkscape`, `rdf`, `cc`, `dc`, `sketch` and
  `serif` namespaces, with their `xmlns:` declarations. The dev server and the
  build warn once per file with what they left out, so a file saved by Inkscape
  compiles as it is.
- A file that is not well-formed XML stops the build with what is wrong in it.
  What comes before the `<svg>` root, such as a DOCTYPE, is left out. The plugin
  reads the five entities of XML and the numeric references only, so an entity
  of a DOCTYPE, such as an external entity, stops the build instead of
  expanding. The Save As of Adobe Illustrator writes its namespaces as such
  entities, as in `xmlns="&ns_svg;"`, and stops with
  `&ns_svg; is not an XML entity`: export the file with Export As, choosing SVG,
  which writes the namespaces as text.
- Comments and processing instructions are left out of the component and of
  `?raw`.

The checks do not make an untrusted SVG safe: they leave external references,
such as an `<image>`, a `<use>` or an `<a>` that points to a URL, or a CSS
`url()`. An SVG that a user uploads needs a sanitizer at runtime, not a folder
collection. The icons of an installed collection go through the same checks.
