import 'server-only'
import { protectInvocation } from './registration/index.ts'

type Operation<T> = { run: () => T; allowControl?: never }

export function protectServerOperation<T>({ run }: Operation<T>): T {
  return protectInvocation({ run })
}
