type MemoizeOnceOptions<Value> = {
  render: () => Value
  isEnabled: boolean
}

type CachedValue<Value> = { value: Value }

export function memoizeOnce<Value>({
  render,
  isEnabled
}: MemoizeOnceOptions<Value>): () => Value {
  if (!isEnabled) return render
  let cache: CachedValue<Value> | undefined
  return () => {
    cache ??= { value: render() }
    return cache.value
  }
}
