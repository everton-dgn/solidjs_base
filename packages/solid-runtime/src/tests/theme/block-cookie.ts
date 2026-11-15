function blocked(): never {
  throw new Error('blocked')
}

// Restore cookie access before teardown; onTestFinished also guards early failures.
export function blockCookie(): () => void {
  const original = Object.getOwnPropertyDescriptor(document, 'cookie')
  let isActive = true

  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: blocked,
    set: blocked
  })

  const restore = (): void => {
    if (!isActive) return
    isActive = false
    if (original) {
      Object.defineProperty(document, 'cookie', original)
      return
    }
    Reflect.deleteProperty(document, 'cookie')
  }

  onTestFinished(restore)

  return restore
}
