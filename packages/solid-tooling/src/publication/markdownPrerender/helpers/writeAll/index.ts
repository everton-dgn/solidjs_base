type WritableHandle = {
  write: (buffer: Uint8Array) => Promise<{ bytesWritten: number }>
}
type WriteAllOptions = {
  output: WritableHandle
  bytes: Uint8Array
  signal?: AbortSignal
}

// FileHandle.write can write fewer bytes than requested. Continue from the last
// offset and reject a write that makes no progress.
export async function writeAll({
  output,
  bytes,
  signal
}: WriteAllOptions): Promise<void> {
  let offset = 0
  while (offset < bytes.byteLength) {
    signal?.throwIfAborted()
    const { bytesWritten } = await output.write(bytes.subarray(offset))
    if (bytesWritten <= 0) throw new Error('File write made no progress')
    offset += bytesWritten
  }
}
