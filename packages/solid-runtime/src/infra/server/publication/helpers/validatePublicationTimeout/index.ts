const MAX_TIMEOUT_MS = 2_147_483_647

export function validatePublicationTimeout(timeoutMs: number): void {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw new RangeError(
      'Publication timeout must be an integer between 1 and 2147483647 milliseconds'
    )
  }
}
