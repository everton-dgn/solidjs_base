import { describe, expect, it } from 'vite-plus/test'

describe('application location', () => {
  it('starts at the base locale', () => {
    expect(globalThis.location.pathname).toBe('/fr')
  })
})
