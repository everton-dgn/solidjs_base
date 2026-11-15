// A character of the name of a collection or of "icon:", written as an
// escape of a string: \x6f, o, \u{6f}, or a letter that is no escape
// of its own, as in \a.
const NAME_CHARACTER_CODE = String.raw`(?:2[Dd]|3[\dAa]|6[1-9A-Fa-f]|7[\dAa])`
const NAME_CHARACTER_ESCAPE = String.raw`\\(?:x${NAME_CHARACTER_CODE}|u00${NAME_CHARACTER_CODE}|u\{0*${NAME_CHARACTER_CODE}\}|[:acdeg-mo-qswyz-])`
// A backslash before a line terminator continues the string on the next
// line and adds no character to its value; a CRLF starts with its CR.
const LINE_CONTINUATION = String.raw`\\[\n\r\u2028\u2029]`

// The quoted name of a collection alone, as an import of the collection
// writes it; a module with only imports of one icon skips the parser. A
// string that starts as the import of a collection and goes on with an
// escape of a character of that import, or with a line continuation, may
// spell one, as in 'icon:own', so the parser reads its value. Escapes
// such as \n do not.
export const COLLECTION_IMPORT = new RegExp(
  String.raw`(?<quote>["'])(?:icon:[a-z0-9]+(?:-[a-z0-9]+)*\k<quote>|(?:i(?:c(?:o(?:n(?::[\da-z-]*)?)?)?)?)?(?:${NAME_CHARACTER_ESCAPE}|${LINE_CONTINUATION}))`,
  'u'
)
