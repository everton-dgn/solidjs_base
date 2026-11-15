export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// The code of a system error, such as ENOENT, without the absolute path
// that its message carries.
export function errorCode(error: unknown): string {
  return error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : messageOf(error)
}
