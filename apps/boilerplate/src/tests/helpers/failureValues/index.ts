// Throws any value, including non-Errors, from an expression.
export function throwValue(value: unknown): never {
  throw value
}
