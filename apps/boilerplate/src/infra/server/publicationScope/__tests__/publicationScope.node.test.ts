import { protectServerOperation } from '@evertondgn/solid-runtime/server/protect-server-operation'

import { createPublicationController } from '@/infra/server/publication/index.ts'

const CONCURRENT_OPERATIONS = 2

async function ignoreRejection(operation: Promise<unknown>): Promise<void> {
  try {
    await operation
  } catch {
    // Este chamador desacoplado observa a falha sem encerrar a publicação.
  }
}

describe('publication backend ownership', () => {
  it('isolates concurrent scopes and keeps rejected detached operations accounted', async () => {
    const controller = createPublicationController()
    const first = Promise.withResolvers<string>()
    const second = Promise.withResolvers<string>()
    const run = (pending: Promise<string>) =>
      controller.runPublication({
        kind: 'markdown',
        timeoutMs: 1000,
        maxOutputBytes: 100,
        run: () => {
          void ignoreRejection(protectServerOperation({ run: () => pending }))
          return new Response(null)
        }
      })
    await Promise.all([run(first.promise), run(second.promise)])
    expect(controller.getMetrics().active).toBe(CONCURRENT_OPERATIONS)
    first.resolve('done')
    await vi.waitFor(() => expect(controller.getMetrics().active).toBe(1))
    second.reject(new Error('backend failed'))
    await vi.waitFor(() => expect(controller.getMetrics().active).toBe(0))
  })

  it('refuses detached backend work after its publication has completed', async () => {
    const controller = createPublicationController()
    const gate = Promise.withResolvers<boolean>()
    const delayed = Promise.withResolvers<Promise<void>>()
    const backend = vi.fn<() => string>(() => 'data')
    async function later(): Promise<void> {
      await gate.promise
      protectServerOperation({ run: backend })
    }
    await controller.runPublication({
      kind: 'markdown',
      timeoutMs: 1000,
      maxOutputBytes: 100,
      run: () => {
        delayed.resolve(later())
        return new Response(null)
      }
    })
    expect(controller.getMetrics().active).toBe(0)
    gate.resolve(true)
    await expect(delayed.promise).rejects.toThrow(
      'The request could not be completed.'
    )
    expect(backend).not.toHaveBeenCalled()
  })
})
