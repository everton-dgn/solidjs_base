type CompileInput = { svg: string; isRaw: boolean }

const BRACES = /[{}]/gu
const SVG_OPEN_TAG_END = /(?<=<svg[^>]*)>/u

// The module goes through the Solid plugin as TSX, so the compiler of the
// installed Solid version writes the DOM and the SSR output. Braces in the
// markup would open a JSX expression.
function componentModule(svg: string): string {
  const markup = svg
    .replaceAll(BRACES, brace => `{'${brace}'}`)
    .replace(SVG_OPEN_TAG_END, ' {...props}>')
  return `export default (props = {}) => ${markup}\n`
}

export function compileIcon({ svg, isRaw }: CompileInput): string {
  return isRaw
    ? `export default ${JSON.stringify(svg)}\n`
    : componentModule(svg)
}
