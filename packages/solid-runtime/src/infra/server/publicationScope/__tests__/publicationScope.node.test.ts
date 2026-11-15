import { protectServerOperation } from '../../protectServerOperation/index.ts'
import { withPublicationScope } from '../index.ts'

describe('publication backend ownership', () => {
  it('refuses backend work started after abort and leaves ordinary operations alone', async () => {
    const controller = new AbortController()
    const log = vi.spyOn(console, 'error').mockReturnValue()
    const run = vi.fn<() => string>(() => 'data')
    const observe = vi.fn<(operation: Promise<unknown>) => void>()
    await withPublicationScope({
      signal: controller.signal,
      isActive: () => true,
      observe,
      run: async () => {
        await Promise.resolve()
        controller.abort()
        expect(() => protectServerOperation({ run })).toThrow(
          'The request could not be completed.'
        )
      }
    })
    expect({
      backend: run.mock.calls,
      observed: observe.mock.calls,
      log: log.mock.calls
    }).toStrictEqual({ backend: [], observed: [], log: [] })
    expect(protectServerOperation({ run })).toBe('data')
    expect(run).toHaveBeenCalledOnce()
  })

  it.each([
    { name: 'the cancellation reason', isCancellation: true },
    { name: 'another error', isCancellation: false }
  ])(
    'logs an aborted read only when it is not cancellation: $name',
    async ({ isCancellation }) => {
      vi.stubEnv('DEV', false)
      const log = vi.spyOn(console, 'error').mockReturnValue()
      const controller = new AbortController()
      await withPublicationScope({
        signal: controller.signal,
        isActive: () => true,
        observe: vi.fn<(operation: Promise<unknown>) => void>(),
        run: async () => {
          const backend = Promise.withResolvers<never>()
          const pending = protectServerOperation({ run: () => backend.promise })
          const reason = new Error('publication cancelled')
          controller.abort(reason)
          backend.reject(isCancellation ? reason : new Error('backend failed'))
          await expect(pending).rejects.toThrow(
            'The request could not be completed.'
          )
        }
      })
      expect(log).toHaveBeenCalledTimes(isCancellation ? 0 : 1)
    }
  )
})
