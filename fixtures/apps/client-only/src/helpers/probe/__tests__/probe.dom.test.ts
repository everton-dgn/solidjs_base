import { describe, expect, it } from 'vite-plus/test'

describe('application location', () => {
  it('starts at the base locale', () => {
    expect(globalThis.location.pathname).toBe('/')
  })
})

describe('packaged DOM matchers', () => {
  it('registers matchers without an application dependency', () => {
    const element = document.createElement('p')
    element.textContent = 'Packaged DOM matchers'
    expect(element).toHaveTextContent('Packaged DOM matchers')
  })
})
