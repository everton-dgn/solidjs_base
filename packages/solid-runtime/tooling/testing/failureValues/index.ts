// Throws any value, including non-Errors, from an expression.
export function throwValue(value: unknown): never {
  throw value
}

// Both property access and instanceof throw private markers that must never reach responses or logs.
export function hostileValue(): object {
  return new Proxy(
    {},
    {
      get: () => throwValue(new Error('PRIVATE_GET')),
      getPrototypeOf: () => throwValue(new Error('PRIVATE_PROTOTYPE'))
    }
  )
}
